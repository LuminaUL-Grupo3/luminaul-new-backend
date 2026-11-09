import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AdminService } from '../AdminService';
import { AdminRepository, ContentRef, UserRecord } from '../../repository/AdminRepository';
import { NotificationClient } from '../../client/NotificationClient';
import { ChatClient } from '../../client/ChatClient';
import { UserStatusChangeStrategy } from '../../strategy/UserStatusChangeStrategy';
import { AdminException } from '../../exception/AdminException';
import {
  AppealsQueryDto,
  ChangeUserStatusDto,
  ReportsQueryDto,
  ResolveAppealDto,
  ResolveReportDto,
  UsersQueryDto,
} from '../../dto/admin-request.dto';
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
} from '../../dto/admin-response.dto';
import {
  AppealStatus,
  ManagedUserStatus,
  NotificationType,
  ReportAction,
  ReportStatus,
} from '../../enums/administration.enums';
import { resolveContentTarget } from '../../policies/content-targets';
import {
  ADMIN_MESSAGES,
  AuditAction,
  NOTICES,
  USER_STATUS_STRATEGIES,
} from '../../administration.constants';

/**
 * Implementación de los casos de uso del panel de administración (SPEC-07).
 *
 * El controller ya garantizó que quien llama es admin (JwtAuthGuard + RolesGuard).
 * Aquí viven las reglas de negocio de las HU. Esta clase colabora con:
 *   - AdminRepository (DAO): lee y escribe en la base de datos.
 *   - NotificationClient y ChatClient (Adapter): avisan al alumno y al chat.
 *   - UserStatusChangeStrategy (Strategy): suspender o reactivar una cuenta (HU 7.1).
 * Todas llegan por el constructor como abstracciones (DIP).
 */
@Injectable()
export class AdminServiceImpl extends AdminService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly notificationClient: NotificationClient,
    private readonly chatClient: ChatClient,
    @Inject(USER_STATUS_STRATEGIES)
    private readonly statusStrategies: Record<ManagedUserStatus, UserStatusChangeStrategy>,
  ) {
    super();
  }

  // ---------- HU 7.4: historial de reportes ----------

  async listReports(query: ReportsQueryDto): Promise<AdminReportListResponseDto> {
    const page = await this.repository.findReports(query.status ?? null, query.limit, query.offset);
    return { total: page.total, items: page.rows.map((row) => AdminReportDetailDto.fromRow(row)) };
  }

  // ---------- HU 7.2: resolver un reporte (y eliminar el contenido si corresponde) ----------

  async resolveReport(
    adminId: string,
    reportId: string,
    dto: ResolveReportDto,
  ): Promise<ResolveReportResponseDto> {
    const report = await this.repository.findReportById(reportId);
    if (!report) {
      throw new AdminException(ADMIN_MESSAGES.REPORT_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (report.status !== ReportStatus.PENDING) {
      throw new AdminException(ADMIN_MESSAGES.REPORT_ALREADY_RESOLVED, HttpStatus.CONFLICT);
    }

    const deleteContent = dto.action === ReportAction.DELETE_CONTENT;
    if (deleteContent && dto.status !== ReportStatus.RESOLVED) {
      throw new AdminException(ADMIN_MESSAGES.DELETE_REQUIRES_RESOLVED, HttpStatus.BAD_REQUEST);
    }

    const target = resolveContentTarget(report.targetType);
    if (!target) {
      throw new AdminException(ADMIN_MESSAGES.UNSUPPORTED_CONTENT, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    let contentToDelete: ContentRef | null = null;
    let authorId: string | null = null;
    if (deleteContent) {
      const content = await this.repository.findContent(target, report.targetId);
      if (!content) {
        throw new AdminException(ADMIN_MESSAGES.CONTENT_NOT_FOUND, HttpStatus.NOT_FOUND);
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
    // Otro administrador lo cerró entre la lectura y la escritura
    if (!resolved) {
      throw new AdminException(ADMIN_MESSAGES.REPORT_ALREADY_RESOLVED, HttpStatus.CONFLICT);
    }

    // El chat se actualiza solo después de confirmar el borrado y su auditoría
    if (deleteContent) {
      this.chatClient.contentVisibilityChanged(report.targetType, report.targetId);
    }

    if (authorId) {
      this.notificationClient.notify({
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
    return { total: page.total, items: page.rows.map((row) => AdminAppealDetailDto.fromRow(row)) };
  }

  // ---------- HU 7.3: aprobar o rechazar una apelación ----------

  async resolveAppeal(
    adminId: string,
    appealId: string,
    dto: ResolveAppealDto,
  ): Promise<ResolveAppealResponseDto> {
    const appeal = await this.repository.findAppealById(appealId);
    if (!appeal) {
      throw new AdminException(ADMIN_MESSAGES.APPEAL_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (appeal.status !== AppealStatus.PENDING) {
      throw new AdminException(ADMIN_MESSAGES.APPEAL_ALREADY_RESOLVED, HttpStatus.CONFLICT);
    }

    const approved = dto.status === AppealStatus.APPROVED;
    const target = resolveContentTarget(appeal.contentType);
    if (approved && !target) {
      throw new AdminException(ADMIN_MESSAGES.UNSUPPORTED_CONTENT, HttpStatus.UNPROCESSABLE_ENTITY);
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
      throw new AdminException(ADMIN_MESSAGES.APPEAL_ALREADY_RESOLVED, HttpStatus.CONFLICT);
    }

    if (approved) {
      this.chatClient.contentVisibilityChanged(appeal.contentType, appeal.contentId);
    }

    const notice = approved ? NOTICES.APPEAL_APPROVED : NOTICES.APPEAL_REJECTED;
    this.notificationClient.notify({ userId: appeal.userId, ...notice, type: NotificationType.MODERATION });

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
    return { total: page.total, items: page.rows.map((row) => AdminUserListItemDto.fromRow(row)) };
  }

  async changeUserStatus(
    adminId: string,
    userId: string,
    dto: ChangeUserStatusDto,
  ): Promise<ChangeUserStatusResponseDto> {
    // Strategy: el estado pedido elige la clase que sabe hacer el cambio (sin if/else)
    const strategy = this.statusStrategies[dto.status];
    const user = await this.validateStatusChange(adminId, userId, strategy);
    return strategy.execute({ adminId, user, reason: dto.reason });
  }

  // ---------- Métricas del panel ----------

  async getStats(): Promise<AdminStatsDto> {
    return AdminStatsDto.fromRow(await this.repository.getStats());
  }

  // Reglas comunes a cualquier cambio de estado de cuenta (HU 7.1). Si alguna no se cumple,
  // se lanza AdminException con el código HTTP y el mensaje exacto.
  private async validateStatusChange(
    adminId: string,
    userId: string,
    strategy: UserStatusChangeStrategy,
  ): Promise<UserRecord> {
    if (adminId === userId) {
      throw new AdminException(ADMIN_MESSAGES.CANNOT_CHANGE_OWN_STATUS, HttpStatus.BAD_REQUEST);
    }
    const user = await this.repository.findUserById(userId);
    if (!user || user.status === 'deleted') {
      throw new AdminException(ADMIN_MESSAGES.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (user.role === 'admin') {
      throw new AdminException(ADMIN_MESSAGES.CANNOT_SUSPEND_ADMIN, HttpStatus.FORBIDDEN);
    }
    // Reactivar una cuenta sin verificar saltaría la verificación por correo de SPEC-01
    if (user.status === 'pending_verification') {
      throw new AdminException(ADMIN_MESSAGES.USER_NOT_VERIFIED, HttpStatus.CONFLICT);
    }
    if (user.status === strategy.targetStatus) {
      throw new AdminException(strategy.alreadyInStatusMessage, HttpStatus.CONFLICT);
    }
    return user;
  }
}
