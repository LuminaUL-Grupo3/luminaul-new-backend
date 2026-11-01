import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../enums/user-role.enum';
import { AUTH_MESSAGES } from '../auth.constants';
import { AuthenticatedRequest } from './jwt-auth.guard';

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
      throw new UnauthorizedException(AUTH_MESSAGES.MISSING_TOKEN);
    }
    if (!requiredRoles.some((role) => role === user.role)) {
      throw new ForbiddenException(AUTH_MESSAGES.FORBIDDEN_ROLE);
    }
    return true;
  }
}
