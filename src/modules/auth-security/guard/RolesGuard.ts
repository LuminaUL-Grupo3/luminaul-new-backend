import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorator/Roles';
import { UserRole } from '../enums/UserRole';
import { AuthException } from '../exception/AuthException';
import { AUTH_MESSAGES } from '../auth.constants';
import { AuthenticatedRequest } from './JwtAuthGuard';

// RBAC: se ejecuta después de JwtAuthGuard y compara req.user.role con @Roles(...)
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      throw new AuthException(AUTH_MESSAGES.MISSING_TOKEN, HttpStatus.UNAUTHORIZED);
    }
    if (!requiredRoles.some((role) => role === user.role)) {
      throw new AuthException(AUTH_MESSAGES.FORBIDDEN_ROLE, HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
