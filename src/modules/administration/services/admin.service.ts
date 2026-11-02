import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AdminRepository,
  AppealRow,
  ContentRef,
  ReportRow,
  UserRow,
} from '../repositories/admin.repository';
import {
  AppealsQueryDto,
  ChangeUserStatusDto,
  ReportsQueryDto,
  ResolveAppealDto,
  ResolveReportDto,
  UsersQueryDto,
} from '../dto/admin-request.dto';
import {
  AdminAppealDetailDto,
  AdminAppealListResponseDto,
  AdminReportDetailDto,
  AdminReportListResponseDto,
  AdminStatsDto,
  AdminUserListItemDto,
  AdminUserListResponseDto,
  ChangeUserStatusResponseDto,
  ResolveAppealResponseDto,
  ResolveReportResponseDto,
} from '../dto/admin-response.dto';
import {
  AppealStatus,
  ManagedUserStatus,
  NotificationType,
  ReportAction,
  ReportStatus,
} from '../enums/administration.enums';
import { resolveContentTarget } from '../policies/content-targets';
import { NotificationSendEvent } from '../events/notification-send.event';
import {
  ADMIN_MESSAGES,
  AuditAction,
  NOTICES,
  NOTIFICATION_SEND_EVENT,
} from '../administration.constants';

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

const toReportDto = (row: ReportRow): AdminReportDetailDto => ({
  id: row.id,
  reason: row.reason,
  status: row.status,
  createdAt: row.created_at.toISOString(),
  resolvedAt: iso(row.resolved_at),
  resolutionNotes: row.resolution_notes,
  reporter: { id: row.reporter_id, email: row.reporter_email, name: row.reporter_name },
  target: {
    type: row.target_type,
    id: row.target_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorStatus: row.author_status,
    content: row.content,
    currentStatus: row.current_status,
  },
});

const toAppealDto = (row: AppealRow): AdminAppealDetailDto => ({
  id: row.id,
  moderationLogId: row.moderation_log_id,
  justification: row.justification,
  status: row.status,
  createdAt: row.created_at.toISOString(),
  resolvedAt: iso(row.resolved_at),
  user: { id: row.user_id, name: row.user_name, email: row.user_email },
  content: {
    type: row.content_type,
    id: row.content_id,
    text: row.content,
    currentStatus: row.current_status,
    detectedWords: row.detected_words ?? [],
    moderatedAt: row.moderated_at.toISOString(),
  },
});

const toUserDto = (row: UserRow): AdminUserListItemDto => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  status: row.status,
  isVerified: row.is_verified,
  suspensionReason: row.suspension_reason,
  createdAt: row.created_at.toISOString(),
});

// Panel de administración (SPEC-07). El controller ya garantizó que quien llama es admin;
// aquí viven las reglas de negocio. Las escrituras atómicas las hace AdminRepository y los
// avisos al alumno salen como eventos 'notification.send' (Observer).
@Injectable()
export class AdminService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly events: EventEmitter2,
  ) {}

  // ---------- HU 7.4: historial de reportes ----------

  async listReports(query: ReportsQueryDto): Promise<AdminReportListResponseDto> {
    const page = await this.repository.findReports(query.status ?? null, query.limit, query.offset);
    return { total: page.total, items: page.rows.map(toReportDto) };
  }

  // ---------- HU 7.2: resolver una denuncia (y eliminar el contenido si corresponde) ----------

  async resolveReport(
    adminId: string,
    reportId: string,
    dto: ResolveReportDto,
  ): Promise<ResolveReportResponseDto> {
    const report = await this.repository.findReportById(reportId);
    if (!report) {
      throw new NotFoundException(ADMIN_MESSAGES.REPORT_NOT_FOUND);
    }
    if (report.status !== ReportStatus.PENDING) {
      throw new ConflictException(ADMIN_MESSAGES.REPORT_ALREADY_RESOLVED);
    }

    const deleteContent = dto.action === ReportAction.DELETE_CONTENT;
    if (deleteContent && dto.status !== ReportStatus.RESOLVED) {
      throw new BadRequestException(ADMIN_MESSAGES.DELETE_REQUIRES_RESOLVED);
    }

    const target = resolveContentTarget(report.targetType);
    if (!target) {
      throw new UnprocessableEntityException(ADMIN_MESSAGES.UNSUPPORTED_CONTENT);
    }

    let contentToDelete: ContentRef | null = null;
    let authorId: string | null = null;
    if (deleteContent) {
      const content = await this.repository.findContent(target, report.targetId);
      if (!content) {
        throw new NotFoundException(ADMIN_MESSAGES.CONTENT_NOT_FOUND);
      }
      contentToDelete = { target, id: content.id };
      authorId = content.authorId;
    }

    const dismissed = dto.status === ReportStatus.DISMISSED;
    const resolved = await this.repository.resolveReport({
      reportId,
      adminId,
      status: dto.status,
      notes: dto.notes || null,
      contentToDelete,
      audit: {
        action: dismissed ? AuditAction.REPORT_DISMISSED : AuditAction.REPORT_RESOLVED,
        details: {
          targetType: report.targetType,
          targetId: report.targetId,
          contentDeleted: deleteContent,
        },
      },
    });
    // Otro administrador la cerró entre la lectura y la escritura
    if (!resolved) {
      throw new ConflictException(ADMIN_MESSAGES.REPORT_ALREADY_RESOLVED);
    }

    // La conversación se actualiza únicamente después de confirmar el borrado y su auditoría.
    if (deleteContent) this.events.emit('content.visibility_changed', {
      contentType: report.targetType, contentId: report.targetId,
    });

    if (authorId) {
      this.notify({
        userId: authorId,
        title: 'Contenido eliminado',
        message: target.removedNotice,
        type: NotificationType.MODERATION,
      });
    }

    const message = deleteContent
      ? target.deletedMessage
      : dismissed
        ? ADMIN_MESSAGES.REPORT_DISMISSED
        : ADMIN_MESSAGES.REPORT_RESOLVED;
    return { message, reportId, status: dto.status };
  }

  // ---------- HU 7.5: historial de apelaciones ----------

  async listAppeals(query: AppealsQueryDto): Promise<AdminAppealListResponseDto> {
    const page = await this.repository.findAppeals(query.status ?? null, query.limit, query.offset);
    return { total: page.total, items: page.rows.map(toAppealDto) };
  }

  // ---------- HU 7.3: aprobar o rechazar una apelación ----------

  async resolveAppeal(
    adminId: string,
    appealId: string,
    dto: ResolveAppealDto,
  ): Promise<ResolveAppealResponseDto> {
    const appeal = await this.repository.findAppealById(appealId);
    if (!appeal) {
      throw new NotFoundException(ADMIN_MESSAGES.APPEAL_NOT_FOUND);
    }
    if (appeal.status !== AppealStatus.PENDING) {
      throw new ConflictException(ADMIN_MESSAGES.APPEAL_ALREADY_RESOLVED);
    }

    const approved = dto.status === AppealStatus.APPROVED;
    const target = resolveContentTarget(appeal.contentType);
    if (approved && !target) {
      throw new UnprocessableEntityException(ADMIN_MESSAGES.UNSUPPORTED_CONTENT);
    }

    const resolved = await this.repository.resolveAppeal({
      appealId,
      adminId,
      status: dto.status,
      contentToRestore: approved && target ? { target, id: appeal.contentId } : null,
      audit: {
        action: approved ? AuditAction.APPEAL_APPROVED : AuditAction.APPEAL_REJECTED,
        details: { contentType: appeal.contentType, contentId: appeal.contentId },
      },
    });
    if (!resolved) {
      throw new ConflictException(ADMIN_MESSAGES.APPEAL_ALREADY_RESOLVED);
    }

    // El chat relee el estado persistido; no se transmiten textos desde administración.
    if (approved) this.events.emit('content.visibility_changed', {
      contentType: appeal.contentType, contentId: appeal.contentId,
    });

    const notice = approved ? NOTICES.APPEAL_APPROVED : NOTICES.APPEAL_REJECTED;
    this.notify({ userId: appeal.userId, ...notice, type: NotificationType.MODERATION });

    return {
      message: approved ? ADMIN_MESSAGES.APPEAL_APPROVED : ADMIN_MESSAGES.APPEAL_REJECTED,
      appealId,
      status: dto.status,
    };
  }

  // ---------- HU 7.1: suspender o reactivar una cuenta ----------

  async listUsers(query: UsersQueryDto): Promise<AdminUserListResponseDto> {
    const page = await this.repository.findUsers(
      query.search || null,
      query.status || null,
      query.limit,
      query.offset,
    );
    return { total: page.total, items: page.rows.map(toUserDto) };
  }

  async changeUserStatus(
    adminId: string,
    userId: string,
    dto: ChangeUserStatusDto,
  ): Promise<ChangeUserStatusResponseDto> {
    if (adminId === userId) {
      throw new BadRequestException(ADMIN_MESSAGES.CANNOT_CHANGE_OWN_STATUS);
    }
    const user = await this.repository.findUserById(userId);
    if (!user || user.status === 'deleted') {
      throw new NotFoundException(ADMIN_MESSAGES.USER_NOT_FOUND);
    }
    if (user.role === 'admin') {
      throw new ForbiddenException(ADMIN_MESSAGES.CANNOT_SUSPEND_ADMIN);
    }
    // Reactivar una cuenta no verificada saltaría la verificación por correo de SPEC-01
    if (user.status === 'pending_verification') {
      throw new ConflictException(ADMIN_MESSAGES.USER_NOT_VERIFIED);
    }

    const suspending = dto.status === ManagedUserStatus.SUSPENDED;
    if (user.status === dto.status) {
      throw new ConflictException(
        suspending ? ADMIN_MESSAGES.USER_ALREADY_SUSPENDED : ADMIN_MESSAGES.USER_ALREADY_ACTIVE,
      );
    }

    const changed = await this.repository.changeUserStatus({
      userId,
      adminId,
      status: dto.status,
      reason: dto.reason,
      audit: {
        action: suspending ? AuditAction.USER_SUSPENDED : AuditAction.USER_ACTIVATED,
        details: { reason: dto.reason, previousStatus: user.status },
      },
    });
    if (!changed) {
      throw new ConflictException(
        suspending ? ADMIN_MESSAGES.USER_ALREADY_SUSPENDED : ADMIN_MESSAGES.USER_ALREADY_ACTIVE,
      );
    }

    // Un suspendido no puede iniciar sesión: el aviso solo tiene sentido al reactivar
    if (!suspending) {
      this.notify({ userId, ...NOTICES.ACCOUNT_REACTIVATED, type: NotificationType.SYSTEM });
    }

    return {
      message: suspending ? ADMIN_MESSAGES.USER_SUSPENDED : ADMIN_MESSAGES.USER_ACTIVATED,
      userId,
      status: dto.status,
    };
  }

  // ---------- Métricas del panel ----------

  async getStats(): Promise<AdminStatsDto> {
    const stats = await this.repository.getStats();
    return {
      totalUsers: Number(stats.total_users),
      totalActiveGroups: Number(stats.total_active_groups),
      totalPosts: Number(stats.total_posts),
      pendingReports: Number(stats.pending_reports),
      pendingAppeals: Number(stats.pending_appeals),
    };
  }

  private notify(event: NotificationSendEvent): void {
    this.events.emit(NOTIFICATION_SEND_EVENT, event);
  }
}
