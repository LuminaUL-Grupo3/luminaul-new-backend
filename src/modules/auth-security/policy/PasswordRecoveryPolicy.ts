import { UserEntity } from '../entities/user.entity';
import { UserAccountStatus } from '../enums/UserAccountStatus';

// Las cuentas suspendidas o borradas no recuperan acceso cambiando la contraseña
const RECOVERABLE_STATUSES: ReadonlySet<UserAccountStatus> = new Set([
  UserAccountStatus.ACTIVE,
  UserAccountStatus.PENDING_VERIFICATION,
]);

export function isRecoverable(user: UserEntity | null): user is UserEntity {
  return user !== null && RECOVERABLE_STATUSES.has(user.status);
}
