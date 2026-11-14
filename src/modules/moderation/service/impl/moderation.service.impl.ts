import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModerationRepository } from '../../repository/moderation.repository';
import { ModerationService } from '../moderation.service';
import { resolveModeratedContent } from '../../policies/moderated-content';
import { CreateAppealDto, CreateReportDto } from '../../dto/moderation-request.dto';
import {
  CreateAppealResponseDto,
  CreateReportResponseDto,
  ModerationLogDto,
  ReportDto,
} from '../../dto/moderation-response.dto';
import { ContentReportEntity } from '../../entities/content-report.entity';
import { AppealStatus, ModerationDecision, ModerationResult, ReportStatus } from '../../enums/moderation.enums';
import { MODERATION_MESSAGES } from '../../moderation.constants';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Código de PostgreSQL para violación de índice único (uq_reporter_target)
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { driverError?: { code?: string } }).driverError?.code === UNIQUE_VIOLATION
  );
}

const toReportDto = (report: ContentReportEntity): ReportDto => ({
  id: report.id,
  reporterId: report.reporterId,
  targetType: report.targetType,
  targetId: report.targetId,
  reason: report.reason,
  status: report.status,
  createdAt: report.createdAt.toISOString(),
});

// Mientras haya una apelación pendiente o rechazada no se puede volver a apelar (SPEC-06 regla 2).
// Si fue aprobada el contenido ya se restauró, así que tampoco tiene sentido apelar de nuevo.
const APPEAL_BLOCKING_STATUSES: readonly AppealStatus[] = [
  AppealStatus.PENDING,
  AppealStatus.REJECTED,
  AppealStatus.APPROVED,
];

@Injectable()
export class ModerationServiceImpl extends ModerationService {
  constructor(
    private readonly repository: ModerationRepository,
    private readonly events: EventEmitter2,
  ) {
    super();
  }

  // HU 6.1: reportar una publicación, mensaje o reseña
  async createReport(userId: string, dto: CreateReportDto): Promise<CreateReportResponseDto> {
    const source = resolveModeratedContent(dto.targetType);
    const content = source ? await this.repository.findContent(source, dto.targetId) : null;
    if (!content) throw new NotFoundException(MODERATION_MESSAGES.TARGET_NOT_FOUND);
    if (content.groupId && !(await this.repository.canAccessGroup(content.groupId, userId))) {
      throw new NotFoundException(MODERATION_MESSAGES.TARGET_NOT_FOUND);
    }
    // El chat ya oculta "Reportar" en mensajes propios; la API aplica la misma regla a todo
    if (content.authorId === userId) {
      throw new BadRequestException(MODERATION_MESSAGES.SELF_REPORT);
    }

    const pending = await this.repository.findPendingReport(userId, dto.targetType, dto.targetId);
    if (pending) throw new ConflictException(MODERATION_MESSAGES.REPORT_DUPLICATED);

    try {
      const report = await this.repository.createReport(userId, dto.targetType, dto.targetId, dto.reason);
      // El denunciante recibe constancia; solo administración recibe el aviso de revisión.
      this.events.emit('notification.send', {
        userId,
        title: 'Reporte recibido',
        message: 'Tu reporte fue registrado y será revisado por administración.',
        type: 'MODERATION',
      });
      this.events.emit('notification.administrators', {
        title: 'Nuevo reporte pendiente',
        message: 'Se registró un reporte de contenido. Revisa el panel de reportes.',
        type: 'MODERATION',
      });
      return {
        message: MODERATION_MESSAGES.REPORT_CREATED,
        reportId: report.id,
        status: ReportStatus.PENDING,
      };
    } catch (error: unknown) {
      // Dos clics simultáneos: el índice único de la base gana la carrera
      if (isUniqueViolation(error)) {
        throw new ConflictException(MODERATION_MESSAGES.REPORT_DUPLICATED);
      }
      throw error;
    }
  }

  async listMyReports(userId: string): Promise<ReportDto[]> {
    const reports = await this.repository.findReportsByReporter(userId);
    return reports.map(toReportDto);
  }

  // HU 6.3: historial de contenido propio moderado
  async listMyLogs(userId: string): Promise<ModerationLogDto[]> {
    const rows = await this.repository.findLogsByAuthor(userId);
    return rows.map(({ log, appealStatus, content }) => ({
      id: log.id,
      contentType: log.contentType,
      contentId: log.contentId,
      result: log.result,
      detectedWords: log.detectedWords,
      content,
      moderatedAt: log.moderatedAt.toISOString(),
      appealStatus,
      canAppeal: appealStatus === null,
    }));
  }

  // HU 6.4: apelar una moderación automática propia
  async createAppeal(userId: string, dto: CreateAppealDto): Promise<CreateAppealResponseDto> {
    const log = await this.repository.findLog(dto.moderationLogId);
    if (!log) throw new NotFoundException(MODERATION_MESSAGES.LOG_NOT_FOUND);
    if (log.authorId !== userId) {
      throw new ForbiddenException('Solo el autor del contenido puede apelar esta moderación');
    }
    if (log.moderationDecision === ModerationDecision.APPROVED || log.result === ModerationResult.APPROVED) {
      throw new BadRequestException('Solo se pueden apelar contenidos que hayan sido sancionados u ocultados');
    }

    const latest = await this.repository.findLatestAppeal(log.id);
    if (latest && APPEAL_BLOCKING_STATUSES.includes(latest.status)) {
      throw new ConflictException(MODERATION_MESSAGES.APPEAL_DUPLICATED);
    }

    try {
      const appeal = await this.repository.createAppeal(log.id, userId, dto.justification);
      if (!appeal) throw new ConflictException(MODERATION_MESSAGES.APPEAL_DUPLICATED);
      this.events.emit('notification.administrators', {
        title: 'Nueva apelación pendiente',
        message: 'Se registró una apelación de moderación. Revisa el panel de apelaciones.',
        type: 'MODERATION',
      });
      return {
        message: MODERATION_MESSAGES.APPEAL_CREATED,
        appealId: appeal.id,
        status: AppealStatus.PENDING,
      };
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(MODERATION_MESSAGES.APPEAL_DUPLICATED);
      }
      throw error;
    }
  }
}
