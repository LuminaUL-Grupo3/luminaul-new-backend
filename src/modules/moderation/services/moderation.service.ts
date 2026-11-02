import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModerationRepository } from '../repositories/moderation.repository';
import { resolveModeratedContent } from '../policies/moderated-content';
import { CreateAppealDto, CreateReportDto } from '../dto/moderation-request.dto';
import {
  CreateAppealResponseDto,
  CreateReportResponseDto,
  ModerationLogDto,
  ReportDto,
} from '../dto/moderation-response.dto';
import { ContentReportEntity } from '../entities/content-report.entity';
import { AppealStatus, ReportStatus } from '../enums/moderation.enums';
import { MODERATION_MESSAGES } from '../moderation.constants';

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
export class ModerationService {
  constructor(private readonly repository: ModerationRepository) {}

  // HU 6.1: reportar una publicación, mensaje o reseña
  async createReport(userId: string, dto: CreateReportDto): Promise<CreateReportResponseDto> {
    const source = resolveModeratedContent(dto.targetType);
    const content = source ? await this.repository.findContent(source, dto.targetId) : null;
    if (!content) throw new NotFoundException(MODERATION_MESSAGES.TARGET_NOT_FOUND);

    const pending = await this.repository.findPendingReport(userId, dto.targetType, dto.targetId);
    if (pending) throw new ConflictException(MODERATION_MESSAGES.REPORT_DUPLICATED);

    try {
      const report = await this.repository.createReport(
        userId,
        dto.targetType,
        dto.targetId,
        dto.reason,
      );
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

    const latest = await this.repository.findLatestAppeal(log.id);
    if (latest && APPEAL_BLOCKING_STATUSES.includes(latest.status)) {
      throw new ConflictException(MODERATION_MESSAGES.APPEAL_DUPLICATED);
    }

    const appeal = await this.repository.createAppeal(log.id, userId, dto.justification);
    return {
      message: MODERATION_MESSAGES.APPEAL_CREATED,
      appealId: appeal.id,
      status: AppealStatus.PENDING,
    };
  }
}
