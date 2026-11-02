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

export const TARGET_CONTENT_TYPES = Object.values(TargetContentType);
