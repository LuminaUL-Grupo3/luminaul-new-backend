import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { extractToken } from './token.util';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser; token?: string }>();
    const token = extractToken(request.headers.authorization, request.headers.cookie);
    if (!token) {
      throw new UnauthorizedException('Falta el token de autenticación');
    }

    const payload = await this.authService.validateToken(token);
    request.user = { id: payload.sub, email: payload.email, role: payload.role };
    request.token = token;
    return true;
  }
}
