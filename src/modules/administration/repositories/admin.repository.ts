import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogEntity } from '../entities/audit-log.entity';
import { CONTENT_TARGETS, ContentTarget } from '../policies/content-targets';
import { AuditAction } from '../administration.constants';

// ---------- Filas que devuelve el repositorio (solo datos, sin reglas) ----------

export interface ReportRecord {
  id: string;
  status: string;
  targetType: string;
  targetId: string;
}

export interface ContentRecord {
  id: string;
  authorId: string;
  status: string;
}

export interface AppealRecord {
  id: string;
  status: string;
  userId: string;
  contentType: string;
  contentId: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

export interface ReportRow {
  id: string;
  reason: string;
  status: string;
  created_at: Date;
  resolved_at: Date | null;
  resolution_notes: string | null;
  target_type: string;
  target_id: string;
  reporter_id: string;
  reporter_email: string;
  reporter_name: string;
  content: string | null;
  current_status: string | null;
  author_id: string | null;
  author_name: string | null;
  author_status: string | null;
}

export interface AppealRow {
  id: string;
  moderation_log_id: string;
  justification: string;
  status: string;
  created_at: Date;
  resolved_at: Date | null;
  user_id: string;
  user_name: string;
  user_email: string;
  content_type: string;
  content_id: string;
  detected_words: string[];
  moderated_at: Date;
  content: string | null;
  current_status: string | null;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  is_verified: boolean;
  suspension_reason: string | null;
  created_at: Date;
}

export interface StatsRow {
  total_users: string;
  total_active_groups: string;
  total_posts: string;
  pending_reports: string;
  pending_appeals: string;
}

export interface Page<T> {
  total: number;
  rows: T[];
}

export interface ContentRef {
  target: ContentTarget;
  id: string;
}

export interface AuditEntry {
  action: AuditAction;
  details: Record<string, unknown>;
}

export interface ResolveReportCommand {
  reportId: string;
  adminId: string;
  status: string;
  notes: string | null;
  contentToDelete: ContentRef | null;
  audit: AuditEntry;
}

export interface ResolveAppealCommand {
  appealId: string;
  adminId: string;
  status: string;
  contentToRestore: ContentRef | null;
  audit: AuditEntry;
}

export interface ChangeUserStatusCommand {
  userId: string;
  adminId: string;
  status: string;
  reason: string;
  audit: AuditEntry;
}

// Las columnas de contenido salen de la tabla de estrategias, nunca de la petición:
// los nombres interpolados en el SQL son constantes del código.
const TARGET_ENTRIES = Object.entries(CONTENT_TARGETS);

const contentJoins = (sourceType: string, sourceId: string): string =>
  TARGET_ENTRIES.map(
    ([type, target], index) =>
      `LEFT JOIN ${target.table} c${index} ON ${sourceType} = '${type}' AND c${index}.id = ${sourceId}`,
  ).join('\n');

const coalesceColumn = (column: (target: ContentTarget) => string): string =>
  `COALESCE(${TARGET_ENTRIES.map(([, target], index) => `c${index}.${column(target)}`).join(', ')})`;

// Acceso a datos del panel de administración. Las tablas consultadas pertenecen a otros
// SPECs, por eso se usa SQL directo (AGENTS.md §3.2). El repositorio no decide reglas:
// solo informa lo que encontró o si la escritura afectó filas.
@Injectable()
export class AdminRepository {
  constructor(private readonly dataSource: DataSource) {}

  // ---------- Reportes ----------

  async findReportById(id: string): Promise<ReportRecord | null> {
    const rows: ReportRecord[] = await this.dataSource.query(
      `SELECT id, status, target_type AS "targetType", target_id AS "targetId"
       FROM reports WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findReports(status: string | null, limit: number, offset: number): Promise<Page<ReportRow>> {
    const [rows, count] = await Promise.all([
      this.dataSource.query(
        `SELECT r.id, r.reason, r.status, r.created_at, r.resolved_at, r.resolution_notes,
                r.target_type, r.target_id,
                rep.id AS reporter_id, rep.email AS reporter_email, rep.name AS reporter_name,
                ${coalesceColumn((t) => t.textColumn)} AS content,
                ${coalesceColumn(() => 'status')} AS current_status,
                author.id AS author_id, author.name AS author_name, author.status AS author_status
         FROM reports r
         JOIN users rep ON rep.id = r.reporter_id
         ${contentJoins('r.target_type', 'r.target_id')}
         LEFT JOIN users author ON author.id = ${coalesceColumn((t) => t.authorColumn)}
         WHERE ($1::text IS NULL OR r.status = $1)
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset],
      ) as Promise<ReportRow[]>,
      this.dataSource.query(
        'SELECT COUNT(*) AS total FROM reports WHERE ($1::text IS NULL OR status = $1)',
        [status],
      ) as Promise<{ total: string }[]>,
    ]);
    return { total: Number(count[0].total), rows };
  }

  async findContent(target: ContentTarget, id: string): Promise<ContentRecord | null> {
    const rows: ContentRecord[] = await this.dataSource.query(
      `SELECT id, ${target.authorColumn} AS "authorId", status
       FROM ${target.table} WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  }

  // Unit of Work: borrar el contenido, cerrar la denuncia y auditar ocurren juntos o nada.
  // Devuelve false si otro administrador resolvió la denuncia en paralelo.
  async resolveReport(command: ResolveReportCommand): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const [, affected] = await manager.query(
        `UPDATE reports
         SET status = $2, resolved_by = $3, resolved_at = NOW(), resolution_notes = $4
         WHERE id = $1 AND status = 'pending'`,
        [command.reportId, command.status, command.adminId, command.notes],
      );
      if (affected === 0) {
        return false;
      }
      if (command.contentToDelete) {
        await this.softDeleteContent(manager, command.contentToDelete);
      }
      await this.insertAudit(manager, command.adminId, 'report', command.reportId, command.audit);
      return true;
    });
  }

  // ---------- Apelaciones ----------

  async findAppealById(id: string): Promise<AppealRecord | null> {
    const rows: AppealRecord[] = await this.dataSource.query(
      `SELECT a.id, a.status, a.user_id AS "userId",
              ml.content_type AS "contentType", ml.content_id AS "contentId"
       FROM appeals a
       JOIN moderation_logs ml ON ml.id = a.moderation_log_id
       WHERE a.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findAppeals(status: string | null, limit: number, offset: number): Promise<Page<AppealRow>> {
    const [rows, count] = await Promise.all([
      this.dataSource.query(
        `SELECT a.id, a.moderation_log_id, a.justification, a.status, a.created_at, a.resolved_at,
                u.id AS user_id, u.name AS user_name, u.email AS user_email,
                ml.content_type, ml.content_id, ml.detected_words, ml.moderated_at,
                ${coalesceColumn((t) => t.textColumn)} AS content,
                ${coalesceColumn(() => 'status')} AS current_status
         FROM appeals a
         JOIN users u ON u.id = a.user_id
         JOIN moderation_logs ml ON ml.id = a.moderation_log_id
         ${contentJoins('ml.content_type', 'ml.content_id')}
         WHERE ($1::text IS NULL OR a.status = $1)
         ORDER BY a.created_at DESC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset],
      ) as Promise<AppealRow[]>,
      this.dataSource.query(
        'SELECT COUNT(*) AS total FROM appeals WHERE ($1::text IS NULL OR status = $1)',
        [status],
      ) as Promise<{ total: string }[]>,
    ]);
    return { total: Number(count[0].total), rows };
  }

  // Unit of Work: restaurar el contenido, cerrar la apelación y auditar
  async resolveAppeal(command: ResolveAppealCommand): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const [, affected] = await manager.query(
        `UPDATE appeals SET status = $2, resolved_by = $3, resolved_at = NOW()
         WHERE id = $1 AND status = 'pending'`,
        [command.appealId, command.status, command.adminId],
      );
      if (affected === 0) {
        return false;
      }
      if (command.contentToRestore) {
        await this.restoreContent(manager, command.contentToRestore);
      }
      await this.insertAudit(manager, command.adminId, 'appeal', command.appealId, command.audit);
      return true;
    });
  }

  // ---------- Usuarios ----------

  async findUserById(id: string): Promise<UserRecord | null> {
    const rows: UserRecord[] = await this.dataSource.query(
      'SELECT id, email, name, role, status FROM users WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async findUsers(
    search: string | null,
    status: string | null,
    limit: number,
    offset: number,
  ): Promise<Page<UserRow>> {
    const where = `WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
                     AND ($2::text IS NULL OR status = $2)`;
    const [rows, count] = await Promise.all([
      this.dataSource.query(
        `SELECT id, email, name, role, status, is_verified, suspension_reason, created_at
         FROM users ${where}
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [search, status, limit, offset],
      ) as Promise<UserRow[]>,
      this.dataSource.query(`SELECT COUNT(*) AS total FROM users ${where}`, [search, status]) as Promise<
        { total: string }[]
      >,
    ]);
    return { total: Number(count[0].total), rows };
  }

  // Suspender actualiza tokens_valid_after: el JwtAuthGuard de SPEC-01 rechaza de inmediato
  // cualquier JWT emitido antes, sin lista negra de tokens.
  async changeUserStatus(command: ChangeUserStatusCommand): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const suspending = command.status === 'suspended';
      const [, affected] = await manager.query(
        `UPDATE users
         SET status = $2,
             suspension_reason = CASE WHEN $3 THEN $4 ELSE NULL END,
             tokens_valid_after = CASE WHEN $3 THEN NOW() ELSE tokens_valid_after END,
             updated_at = NOW()
         WHERE id = $1 AND status <> $2 AND status IN ('active', 'suspended')`,
        [command.userId, command.status, suspending, command.reason],
      );
      if (affected === 0) {
        return false;
      }
      await this.insertAudit(manager, command.adminId, 'user', command.userId, command.audit);
      return true;
    });
  }

  // ---------- Métricas ----------

  async getStats(): Promise<StatsRow> {
    const rows: StatsRow[] = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE status <> 'deleted') AS total_users,
         (SELECT COUNT(*) FROM groups WHERE deleted_at IS NULL) AS total_active_groups,
         (SELECT COUNT(*) FROM publications WHERE status = 'published' AND deleted_at IS NULL) AS total_posts,
         (SELECT COUNT(*) FROM reports WHERE status = 'pending') AS pending_reports,
         (SELECT COUNT(*) FROM appeals WHERE status = 'pending') AS pending_appeals`,
    );
    return rows[0];
  }

  // ---------- Auxiliares de escritura ----------

  private async softDeleteContent(manager: EntityManager, { target, id }: ContentRef): Promise<void> {
    const touch = target.hasUpdatedAt ? ', updated_at = NOW()' : '';
    await manager.query(
      `UPDATE ${target.table} SET status = $2, deleted_at = NOW()${touch}
       WHERE id = $1 AND deleted_at IS NULL`,
      [id, target.deletedStatus],
    );
  }

  // Solo se restaura lo que el bot ocultó; un contenido borrado por el administrador no revive
  private async restoreContent(manager: EntityManager, { target, id }: ContentRef): Promise<void> {
    const touch = target.hasUpdatedAt ? ', updated_at = NOW()' : '';
    await manager.query(
      `UPDATE ${target.table} SET status = 'published'${touch}
       WHERE id = $1 AND status = 'hidden' AND deleted_at IS NULL`,
      [id],
    );
  }

  private async insertAudit(
    manager: EntityManager,
    adminId: string,
    targetEntity: string,
    targetId: string,
    audit: AuditEntry,
  ): Promise<void> {
    await manager.save(
      manager.create(AuditLogEntity, {
        adminId,
        action: audit.action,
        targetEntity,
        targetId,
        details: audit.details,
      }),
    );
  }
}
