import { ContentTarget } from '../policies/content-targets';
import { AuditAction } from '../administration.constants';

// ---------- Filas que devuelve el DAO (solo datos, sin reglas de negocio) ----------

export interface ReportRecord {
  id: string;
  reporterId: string;
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

// ---------- Datos que recibe el DAO para escribir ----------

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

/**
 * Patrón DAO (Data Access Object) del panel de administración.
 *
 * Es la "interfaz" del DAO, como ProductoDAO en los laboratorios: declara QUÉ datos se
 * pueden leer y escribir, sin decir CÓMO. El CÓMO (SQL sobre PostgreSQL) está en
 * impl/AdminRepositoryImpl.ts. El service depende de esta abstracción y no del SQL (DIP),
 * y en las pruebas unitarias se reemplaza por un objeto simulado (mock).
 *
 * En NestJS se usa una clase abstracta en lugar de una interface de TypeScript porque la
 * interface desaparece al compilar y no puede servir como token de inyección.
 */
export abstract class AdminRepository {
  // ---------- Reportes (HU 7.2 y 7.4) ----------
  abstract findReportById(id: string): Promise<ReportRecord | null>;
  abstract findReports(status: string | null, limit: number, offset: number): Promise<Page<ReportRow>>;
  abstract findContent(target: ContentTarget, id: string): Promise<ContentRecord | null>;
  // Devuelve false si otro administrador resolvió el reporte en paralelo
  abstract resolveReport(command: ResolveReportCommand): Promise<boolean>;

  // ---------- Apelaciones (HU 7.3 y 7.5) ----------
  abstract findAppealById(id: string): Promise<AppealRecord | null>;
  abstract findAppeals(status: string | null, limit: number, offset: number): Promise<Page<AppealRow>>;
  abstract resolveAppeal(command: ResolveAppealCommand): Promise<boolean>;

  // ---------- Usuarios (HU 7.1) ----------
  abstract findUserById(id: string): Promise<UserRecord | null>;
  abstract findUsers(
    search: string | null,
    status: string | null,
    limit: number,
    offset: number,
  ): Promise<Page<UserRow>>;
  // Devuelve false si la cuenta ya no estaba en un estado que se pueda cambiar
  abstract changeUserStatus(command: ChangeUserStatusCommand): Promise<boolean>;

  // ---------- Métricas del panel ----------
  abstract getStats(): Promise<StatsRow>;
}
