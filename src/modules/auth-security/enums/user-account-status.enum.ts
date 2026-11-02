// Estados de cuenta (users.status), según SPEC-01
export enum UserAccountStatus {
  PENDING_VERIFICATION = 'pending_verification',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

export const USER_ACCOUNT_STATUSES = Object.values(UserAccountStatus);
