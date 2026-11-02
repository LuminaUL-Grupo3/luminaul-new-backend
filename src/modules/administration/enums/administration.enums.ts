// Enums del contrato de SPEC-07 (valores tal como se guardan en la base de datos)

export enum NotificationType {
  MODERATION = 'MODERATION',
  GROUP = 'GROUP',
  SYSTEM = 'SYSTEM',
}

export enum ContentType {
  PUBLICATION = 'publication',
  MESSAGE = 'message',
  REVIEW = 'review',
}

export enum ReportStatus {
  PENDING = 'pending',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum ReportAction {
  DELETE_CONTENT = 'delete_content',
  NONE = 'none',
}

export enum AppealStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

// El administrador solo alterna entre estos dos estados (pending_verification y deleted no se tocan)
export enum ManagedUserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}
