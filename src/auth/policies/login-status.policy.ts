import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { UserAccountStatus } from '../enums/user-account-status.enum';
import { AUTH_MESSAGES } from '../auth.constants';

export type LoginPolicy = { allowed: true } | { allowed: false; reject: () => HttpException };

const DENY_AS_INVALID_CREDENTIALS: LoginPolicy = {
  allowed: false,
  reject: () => new UnauthorizedException(AUTH_MESSAGES.INVALID_CREDENTIALS),
};

// State (tabla de políticas): qué ocurre al iniciar sesión según el estado de la cuenta.
// Un estado nuevo se agrega como una entrada más, sin tocar AuthService.
export const LOGIN_STATUS_POLICIES: Readonly<Record<UserAccountStatus, LoginPolicy>> = {
  [UserAccountStatus.ACTIVE]: { allowed: true },
  [UserAccountStatus.PENDING_VERIFICATION]: {
    allowed: false,
    reject: () => new ForbiddenException(AUTH_MESSAGES.ACCOUNT_PENDING),
  },
  [UserAccountStatus.SUSPENDED]: {
    allowed: false,
    reject: () => new ForbiddenException(AUTH_MESSAGES.ACCOUNT_SUSPENDED),
  },
  // Una cuenta borrada se comporta como si no existiera
  [UserAccountStatus.DELETED]: DENY_AS_INVALID_CREDENTIALS,
};

export function enforceLoginPolicy(status: UserAccountStatus): void {
  // Un valor inesperado en la base de datos se rechaza como credenciales incorrectas
  const policy = LOGIN_STATUS_POLICIES[status] ?? DENY_AS_INVALID_CREDENTIALS;
  if (!policy.allowed) {
    throw policy.reject();
  }
}
