import { ContentModerationLogEntity } from '../entities/content-moderation-log.entity';
import { ContentReportEntity } from '../entities/content-report.entity';
import { ContentAppealEntity } from '../entities/content-appeal.entity';
import { ContentModerationTaskEntity } from '../entities/content-moderation-task.entity';
import {
  AppealStatus,
  LexicalResult,
  ModerationDecision,
  SemanticStatus,
  TargetContentType,
} from '../enums/moderation.enums';
import { ModeratedContentSource } from '../policies/moderated-content';

// Datos mínimos de un contenido de otro módulo, leídos por SQL (AGENTS.md §3.2)
export interface ContentSnapshot {
  authorId: string;
  groupId: string | null;
  status: string;
  text?: string;
}

export interface ModerationLogWithAppeal {
  log: ContentModerationLogEntity;
  appealStatus: AppealStatus | null;
  content: string | null;
}

// Acceso a datos de SPEC-06. Los servicios dependen de esta abstracción y ModerationModule
// le asigna ModerationRepositoryImpl (TypeORM + PostgreSQL), igual que ReviewsRepository (SPEC-05).
export abstract class ModerationRepository {
  // ---------- Motor léxico y catálogo (HU 6.2) ----------
  abstract listBannedWords(): Promise<string[]>;

  // Lee un contenido de otro módulo; los borrados lógicos cuentan como inexistentes
  abstract findContent(source: ModeratedContentSource, id: string): Promise<ContentSnapshot | null>;

  // ---------- Cola de tareas del worker (HU 6.2) ----------
  abstract completeTaskDiscarded(taskId: string, lockToken: string, reason: string): Promise<boolean>;

  abstract enqueueTask(
    contentType: TargetContentType,
    contentId: string,
    contentVersion?: number,
  ): Promise<ContentModerationTaskEntity | null>;

  abstract claimNextBatch(
    batchSize: number,
    workerId: string,
    leaseDurationSec?: number,
  ): Promise<ContentModerationTaskEntity[]>;

  abstract completeTaskSuccess(
    taskId: string,
    lockToken: string,
    source: ModeratedContentSource,
    contentId: string,
    authorId: string,
    decision: ModerationDecision,
    lexicalResult: LexicalResult,
    semanticStatus: SemanticStatus,
    detectedWords: string[],
  ): Promise<ContentModerationLogEntity | null>;

  abstract rescheduleTaskRetry(
    taskId: string,
    lockToken: string,
    attempts: number,
    delaySec: number,
    errorMsg: string,
  ): Promise<boolean>;

  abstract reconcileStaleTasks(): Promise<number>;

  abstract findUnmoderatedContentIds(source: ModeratedContentSource, limit?: number): Promise<string[]>;

  // ---------- Reportes (HU 6.1) ----------
  abstract canAccessGroup(groupId: string, userId: string): Promise<boolean>;

  abstract findPendingReport(
    reporterId: string,
    targetType: TargetContentType,
    targetId: string,
  ): Promise<ContentReportEntity | null>;

  abstract createReport(
    reporterId: string,
    targetType: TargetContentType,
    targetId: string,
    reason: string,
  ): Promise<ContentReportEntity>;

  abstract findReportsByReporter(reporterId: string): Promise<ContentReportEntity[]>;

  // ---------- Historial y apelaciones (HU 6.3 y 6.4) ----------
  abstract findLog(id: string): Promise<ContentModerationLogEntity | null>;

  abstract findLatestAppeal(moderationLogId: string): Promise<ContentAppealEntity | null>;

  abstract createAppeal(
    moderationLogId: string,
    userId: string,
    justification: string,
  ): Promise<ContentAppealEntity | null>;

  abstract findLogsByAuthor(authorId: string): Promise<ModerationLogWithAppeal[]>;
}
