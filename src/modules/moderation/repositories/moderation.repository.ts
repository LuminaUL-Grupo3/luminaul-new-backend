import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BannedWordEntity } from '../entities/banned-word.entity';
import { ContentModerationLogEntity } from '../entities/content-moderation-log.entity';
import { ContentReportEntity } from '../entities/content-report.entity';
import { ContentAppealEntity } from '../entities/content-appeal.entity';
import { ContentModerationTaskEntity } from '../entities/content-moderation-task.entity';
import {
  AppealStatus,
  LexicalResult,
  ModerationDecision,
  ModerationResult,
  ReportStatus,
  SemanticStatus,
  TargetContentType,
  TaskStatus,
} from '../enums/moderation.enums';
import { MODERATED_CONTENT, ModeratedContentSource } from '../policies/moderated-content';

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

@Injectable()
export class ModerationRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(BannedWordEntity)
    private readonly bannedWords: Repository<BannedWordEntity>,
    @InjectRepository(ContentModerationLogEntity)
    private readonly logs: Repository<ContentModerationLogEntity>,
    @InjectRepository(ContentReportEntity)
    private readonly reports: Repository<ContentReportEntity>,
    @InjectRepository(ContentAppealEntity)
    private readonly appeals: Repository<ContentAppealEntity>,
    @InjectRepository(ContentModerationTaskEntity)
    private readonly tasks: Repository<ContentModerationTaskEntity>,
  ) {}

  // ---------- Motor léxico y catálogo (HU 6.2) ----------

  async listBannedWords(): Promise<string[]> {
    const rows = await this.bannedWords.find({ select: { word: true } });
    return rows.map((row) => row.word);
  }

  // Lee un contenido de otro módulo; los borrados lógicos cuentan como inexistentes.
  async findContent(source: ModeratedContentSource, id: string): Promise<ContentSnapshot | null> {
    const group = source.groupColumn ? `${source.groupColumn}::text` : 'NULL';
    const rows: ContentSnapshot[] = await this.dataSource.query(
      `SELECT ${source.authorColumn}::text AS "authorId", 
              ${group} AS "groupId", 
              status, 
              ${source.textColumn} AS "text"
       FROM ${source.table}
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  }

  // Resuelve la tarea sin insertar log si el contenido ya fue eliminado o no existe
  async completeTaskDiscarded(
    taskId: string,
    lockToken: string,
    reason: string,
  ): Promise<boolean> {
    const [, affected]: [unknown, number] = await this.dataSource.query(
      `UPDATE moderation_tasks
       SET status = 'processed',
           completed_at = CURRENT_TIMESTAMP,
           last_error = $1,
           locked_at = NULL,
           lock_token = NULL,
           lease_expires_at = NULL
       WHERE id = $2 AND lock_token = $3`,
      [reason, taskId, lockToken],
    );
    return affected > 0;
  }

  // ---------- Tareas persistidas y Worker en 3 Etapas ----------

  async enqueueTask(
    contentType: TargetContentType,
    contentId: string,
    contentVersion?: number,
  ): Promise<ContentModerationTaskEntity | null> {
    const returningClause = `
      RETURNING id, content_type AS "contentType", content_id AS "contentId", 
                content_version AS "contentVersion", status, attempts, 
                max_attempts AS "maxAttempts", available_at AS "availableAt"`;

    if (contentVersion !== undefined) {
      const rows: ContentModerationTaskEntity[] = await this.dataSource.query(
        `INSERT INTO moderation_tasks (content_type, content_id, content_version, status, available_at)
         VALUES ($1, $2, $3, 'pending', CURRENT_TIMESTAMP)
         ON CONFLICT (content_type, content_id, content_version) DO NOTHING
         ${returningClause}`,
        [contentType, contentId, contentVersion],
      );
      return rows[0] ?? null;
    }

    const rows: ContentModerationTaskEntity[] = await this.dataSource.query(
      `WITH existing AS (
         SELECT MAX(content_version) AS max_v,
                BOOL_OR(status IN ('pending', 'processing', 'retry')) AS is_active
         FROM moderation_tasks
         WHERE content_type = $1 AND content_id = $2
       )
       INSERT INTO moderation_tasks (content_type, content_id, content_version, status, available_at)
       SELECT $1, $2, COALESCE(max_v, 0) + 1, 'pending', CURRENT_TIMESTAMP
       FROM existing
       WHERE is_active IS NOT TRUE
       ON CONFLICT (content_type, content_id, content_version) DO NOTHING
       ${returningClause}`,
      [contentType, contentId],
    );
    return rows[0] ?? null;
  }

  // Etapa A: Reclama lote de tareas con FOR UPDATE SKIP LOCKED en transacción corta
  async claimNextBatch(
    batchSize: number,
    workerId: string,
    leaseDurationSec = 30,
  ): Promise<ContentModerationTaskEntity[]> {
    return this.dataSource.transaction(async (manager) => {
      const candidates: ContentModerationTaskEntity[] = await manager.query(
        `SELECT id, content_type AS "contentType", content_id AS "contentId", 
                content_version AS "contentVersion", attempts, max_attempts AS "maxAttempts"
         FROM moderation_tasks
         WHERE status IN ('pending', 'retry')
           AND available_at <= CURRENT_TIMESTAMP
           AND (locked_at IS NULL OR lease_expires_at < CURRENT_TIMESTAMP)
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [batchSize],
      );

      if (candidates.length === 0) return [];

      const claimed: ContentModerationTaskEntity[] = [];
      for (const candidate of candidates) {
        const result = await manager.query(
          `UPDATE moderation_tasks
           SET status = 'processing',
               locked_by = $1,
               lock_token = gen_random_uuid(),
               locked_at = CURRENT_TIMESTAMP,
               lease_expires_at = CURRENT_TIMESTAMP + ($2 || ' seconds')::interval
           WHERE id = $3
           RETURNING id, content_type AS "contentType", content_id AS "contentId", 
                     content_version AS "contentVersion", status, attempts, 
                     max_attempts AS "maxAttempts", lock_token AS "lockToken", 
                     locked_at AS "lockedAt", lease_expires_at AS "leaseExpiresAt"`,
          [workerId, leaseDurationSec, candidate.id],
        );
        const rows = Array.isArray(result[0]) ? result[0] : result;
        const updated = rows[0] as ContentModerationTaskEntity | undefined;
        if (updated) claimed.push(updated);
      }

      return claimed;
    });
  }

  // Etapa C: Guarda resultado y resuelve la tarea en transacción corta (con optimistic lock en lockToken)
  async completeTaskSuccess(
    taskId: string,
    lockToken: string,
    source: ModeratedContentSource,
    contentId: string,
    authorId: string,
    decision: ModerationDecision,
    lexicalResult: LexicalResult,
    semanticStatus: SemanticStatus,
    detectedWords: string[],
  ): Promise<ContentModerationLogEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Validar lock_token
      const [task]: { id: string }[] = await manager.query(
        `SELECT id FROM moderation_tasks WHERE id = $1 AND lock_token = $2`,
        [taskId, lockToken],
      );
      if (!task) return null; // El lease expiró y otro worker la tomó

      // 2. Actualizar estado del contenido según la decisión
      if (decision === ModerationDecision.HIDDEN) {
        await manager.query(
          `UPDATE ${source.table} SET status = 'hidden'
           WHERE id = $1 AND deleted_at IS NULL`,
          [contentId],
        );
      } else if (decision === ModerationDecision.APPROVED) {
        await manager.query(
          `UPDATE ${source.table} SET status = 'published'
           WHERE id = $1 AND deleted_at IS NULL AND status = 'pending_moderation'`,
          [contentId],
        );
      }

      // 3. Crear registro de auditoría idempotente en moderation_logs
      const resultValue = decision === ModerationDecision.HIDDEN ? ModerationResult.BLOCKED : ModerationResult.APPROVED;
      const log = manager.create(ContentModerationLogEntity, {
        moderationTaskId: taskId,
        contentType: Object.entries(MODERATED_CONTENT).find(([, s]) => s.table === source.table)?.[0] as TargetContentType,
        contentId,
        authorId,
        detectedWords,
        result: resultValue,
        lexicalResult,
        semanticStatus,
        moderationDecision: decision,
      });
      const savedLog = await manager.save(log);

      // 4. Marcar tarea como processed
      await manager.query(
        `UPDATE moderation_tasks
         SET status = 'processed',
             completed_at = CURRENT_TIMESTAMP,
             locked_at = NULL,
             lock_token = NULL,
             lease_expires_at = NULL
         WHERE id = $1`,
        [taskId],
      );

      return savedLog;
    });
  }

  // Etapa C para reintentos con backoff exponencial
  async rescheduleTaskRetry(
    taskId: string,
    lockToken: string,
    attempts: number,
    delaySec: number,
    errorMsg: string,
  ): Promise<boolean> {
    const [, affected]: [unknown, number] = await this.dataSource.query(
      `UPDATE moderation_tasks
       SET status = 'retry',
           attempts = $1,
           available_at = CURRENT_TIMESTAMP + ($2 || ' seconds')::interval,
           last_error = $3,
           locked_at = NULL,
           lock_token = NULL,
           lease_expires_at = NULL
       WHERE id = $4 AND lock_token = $5`,
      [attempts, delaySec, errorMsg, taskId, lockToken],
    );
    return affected > 0;
  }

  // Reconciliador de tareas colgadas por caídas de workers
  async reconcileStaleTasks(): Promise<number> {
    const [, affected]: [unknown, number] = await this.dataSource.query(
      `UPDATE moderation_tasks
       SET status = 'pending',
           locked_at = NULL,
           locked_by = NULL,
           lock_token = NULL,
           lease_expires_at = NULL
       WHERE status = 'processing' AND lease_expires_at < CURRENT_TIMESTAMP`,
    );
    return affected;
  }

  // Reconciliador de contenidos huérfanos sin tarea en moderation_tasks
  async findUnmoderatedContentIds(source: ModeratedContentSource, limit = 20): Promise<string[]> {
    const rows: { id: string }[] = await this.dataSource.query(
      `SELECT c.id::text AS id
       FROM ${source.table} c
       WHERE c.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM moderation_tasks t 
           WHERE t.content_id = c.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM moderation_logs l
           WHERE l.content_id = c.id
         )
       ORDER BY c.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((r) => r.id);
  }

  // ---------- Reportes (HU 6.1) ----------

  async canAccessGroup(groupId: string, userId: string): Promise<boolean> {
    const [row]: { allowed: boolean }[] = await this.dataSource.query(
      `SELECT EXISTS(SELECT 1 FROM groups g WHERE g.id=$1 AND g.deleted_at IS NULL AND
        (EXISTS(SELECT 1 FROM group_members m WHERE m.group_id=g.id AND m.user_id=$2 AND m.status='active')
        OR EXISTS(SELECT 1 FROM users u WHERE u.id=$2 AND u.role='admin' AND u.status='active'))) AS allowed`,
      [groupId, userId],
    );
    return row.allowed;
  }

  findPendingReport(
    reporterId: string,
    targetType: TargetContentType,
    targetId: string,
  ): Promise<ContentReportEntity | null> {
    return this.reports.findOne({
      where: { reporterId, targetType, targetId, status: ReportStatus.PENDING },
    });
  }

  createReport(
    reporterId: string,
    targetType: TargetContentType,
    targetId: string,
    reason: string,
  ): Promise<ContentReportEntity> {
    return this.reports.save(
      this.reports.create({ reporterId, targetType, targetId, reason, status: ReportStatus.PENDING }),
    );
  }

  findReportsByReporter(reporterId: string): Promise<ContentReportEntity[]> {
    return this.reports.find({ where: { reporterId }, order: { createdAt: 'DESC' } });
  }

  // ---------- Historial propio y apelaciones (HU 6.3 / 6.4) ----------

  findLog(id: string): Promise<ContentModerationLogEntity | null> {
    return this.logs.findOne({ where: { id } });
  }

  findLatestAppeal(moderationLogId: string): Promise<ContentAppealEntity | null> {
    return this.appeals.findOne({
      where: { moderationLogId },
      order: { createdAt: 'DESC' },
    });
  }

  async createAppeal(
    moderationLogId: string,
    userId: string,
    justification: string,
  ): Promise<ContentAppealEntity | null> {
    return this.appeals.save(
      this.appeals.create({
        moderationLogId,
        userId,
        justification,
        status: AppealStatus.PENDING,
      }),
    );
  }

  async findLogsByAuthor(authorId: string): Promise<ModerationLogWithAppeal[]> {
    // HU 6.3: Solo listar contenidos sancionados u ocultados por el bot
    const logs = await this.logs.find({
      where: [
        { authorId, moderationDecision: ModerationDecision.HIDDEN },
        { authorId, result: ModerationResult.BLOCKED },
      ],
      order: { moderatedAt: 'DESC' },
    });
    if (logs.length === 0) return [];

    const rows: { moderation_log_id: string; status: AppealStatus }[] = await this.dataSource.query(
      `SELECT DISTINCT ON (moderation_log_id) moderation_log_id, status
       FROM appeals
       WHERE moderation_log_id = ANY($1::uuid[])
       ORDER BY moderation_log_id, created_at DESC`,
      [logs.map((log) => log.id)],
    );
    const latest = new Map(rows.map((row) => [row.moderation_log_id, row.status]));

    const texts = new Map<string, string>();
    for (const [type, source] of Object.entries(MODERATED_CONTENT)) {
      const ids = logs.filter((log) => log.contentType === type).map((log) => log.contentId);
      if (ids.length === 0) continue;
      const found: { id: string; text: string }[] = await this.dataSource.query(
        `SELECT id::text AS id, ${source.textColumn} AS text
         FROM ${source.table}
         WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      found.forEach((row) => texts.set(`${type}:${row.id}`, row.text));
    }

    return logs.map((log) => ({
      log,
      appealStatus: latest.get(log.id) ?? null,
      content: texts.get(`${log.contentType}:${log.contentId}`) ?? null,
    }));
  }
}
