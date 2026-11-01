import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SessionService } from '../services/session.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AUTH_MESSAGES } from '../auth.constants';
import { extractToken } from '../token.util';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser; token?: string };

// Autentica la petición con la cadena de SessionService y deja req.user para @CurrentUser()
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractToken(request.headers.authorization, request.headers.cookie);
    if (!token) {
      throw new UnauthorizedException(AUTH_MESSAGES.MISSING_TOKEN);
    }

    // El rol sale de la base de datos: un cambio de rol aplica sin esperar a un nuevo login
    const { user } = await this.sessions.validate(token);
    request.user = { id: user.id, email: user.email, role: user.role };
    request.token = token;
    return true;
  }
}
