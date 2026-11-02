import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BannedWordEntity } from '../entities/banned-word.entity';
import { ContentModerationLogEntity } from '../entities/content-moderation-log.entity';
import { ContentReportEntity } from '../entities/content-report.entity';
import { ContentAppealEntity } from '../entities/content-appeal.entity';
import {
  AppealStatus,
  ModerationResult,
  ReportStatus,
  TargetContentType,
} from '../enums/moderation.enums';
import { MODERATED_CONTENT, ModeratedContentSource } from '../policies/moderated-content';

// Datos mínimos de un contenido de otro módulo, leídos por SQL (AGENTS.md §3.2)
export interface ContentSnapshot {
  authorId: string;
  groupId: string | null;
  status: string;
}

export interface ModerationLogWithAppeal {
  log: ContentModerationLogEntity;
  appealStatus: AppealStatus | null;
  // Texto moderado; null si el contenido se borró después
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
  ) {}

  // ---------- Motor léxico (HU 6.2) ----------

  async listBannedWords(): Promise<string[]> {
    const rows = await this.bannedWords.find({ select: { word: true } });
    return rows.map((row) => row.word);
  }

  // Lee un contenido de otro módulo; los borrados lógicos cuentan como inexistentes.
  async findContent(source: ModeratedContentSource, id: string): Promise<ContentSnapshot | null> {
    const group = source.groupColumn ? `${source.groupColumn}::text` : 'NULL';
    const rows: ContentSnapshot[] = await this.dataSource.query(
      `SELECT ${source.authorColumn}::text AS "authorId", ${group} AS "groupId", status
       FROM ${source.table}
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  }

  // Oculta el contenido solo si estaba publicado: no pisa un borrado ni un ocultamiento previo.
  async hideContent(source: ModeratedContentSource, id: string): Promise<boolean> {
    const result: [unknown, number] = await this.dataSource.query(
      `UPDATE ${source.table} SET status = 'hidden'
       WHERE id = $1 AND status = 'published' AND deleted_at IS NULL`,
      [id],
    );
    return result[1] > 0;
  }

  saveLog(
    contentType: TargetContentType,
    contentId: string,
    authorId: string,
    detectedWords: string[],
  ): Promise<ContentModerationLogEntity> {
    return this.logs.save(
      this.logs.create({
        contentType,
        contentId,
        authorId,
        detectedWords,
        result: ModerationResult.BLOCKED,
      }),
    );
  }

  // ---------- Reportes (HU 6.1) ----------

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

  createAppeal(
    moderationLogId: string,
    userId: string,
    justification: string,
  ): Promise<ContentAppealEntity> {
    return this.appeals.save(
      this.appeals.create({ moderationLogId, userId, justification, status: AppealStatus.PENDING }),
    );
  }

  async findLogsByAuthor(authorId: string): Promise<ModerationLogWithAppeal[]> {
    const logs = await this.logs.find({ where: { authorId }, order: { moderatedAt: 'DESC' } });
    if (logs.length === 0) return [];

    // Estado de la última apelación de cada moderación, en una sola consulta
    const rows: { moderation_log_id: string; status: AppealStatus }[] = await this.dataSource.query(
      `SELECT DISTINCT ON (moderation_log_id) moderation_log_id, status
       FROM appeals
       WHERE moderation_log_id = ANY($1::uuid[])
       ORDER BY moderation_log_id, created_at DESC`,
      [logs.map((log) => log.id)],
    );
    const latest = new Map(rows.map((row) => [row.moderation_log_id, row.status]));

    // Texto de cada contenido: una consulta por tipo, solo con los ids que aparecen en el historial
    const texts = new Map<string, string>();
    for (const [type, source] of Object.entries(MODERATED_CONTENT)) {
      const ids = logs.filter((log) => log.contentType === type).map((log) => log.contentId);
      if (ids.length === 0) continue;
      const found: { id: string; text: string }[] = await this.dataSource.query(
        `SELECT id::text AS id, ${source.textColumn} AS text
         FROM ${source.table}
         WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
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
