// Valores tal como se guardan en la base de datos (init-db.sql, SPEC-06)

export enum TargetContentType {
  PUBLICATION = 'publication',
  MESSAGE = 'message',
  REVIEW = 'review',
}

export enum ReportStatus {
  PENDING = 'pending',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum ModerationResult {
  FLAGGED = 'flagged',
  BLOCKED = 'blocked',
  APPROVED = 'approved',
}

export enum AppealStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum BannedWordSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum TaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  RETRY = 'retry',
  PROCESSED = 'processed',
  DISCARDED = 'discarded',
  FAILED = 'failed',
}

export enum LexicalResult {
  CLEAN = 'CLEAN',
  BLOCKED = 'BLOCKED',
  NOT_EVALUATED = 'NOT_EVALUATED',
}

export enum SemanticStatus {
  EVALUATED_CLEAN = 'EVALUATED_CLEAN',
  FLAGGED = 'FLAGGED',
  DEGRADED_FALLBACK = 'DEGRADED_FALLBACK',
  NOT_EVALUATED = 'NOT_EVALUATED',
}

export enum ModerationDecision {
  APPROVED = 'APPROVED',
  HIDDEN = 'HIDDEN',
  PENDING_REVIEW = 'PENDING_REVIEW',
}

export const TARGET_CONTENT_TYPES = Object.values(TargetContentType);
