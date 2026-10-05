import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now(), key = `${request.ip}:${request.path}`;
    for (const [id, bucket] of this.attempts) if (bucket.until <= now) this.attempts.delete(id);
    const bucket = this.attempts.get(key) || { count: 0, until: now + 60000 };
    this.attempts.set(key, bucket);
    if (++bucket.count > 20) throw new HttpException('Demasiados intentos. Espera un minuto antes de volver a intentar.', 429);
    return true;
  }
}
