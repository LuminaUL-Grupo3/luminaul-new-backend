import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { TokenService } from '../TokenService';
import { JwtPayload } from '../JwtPayload';
import { AUTH_LIMITS } from '../../auth.constants';

// JWT HS256 firmado con JWT_SECRET
@Injectable()
export class HmacTokenService extends TokenService {
  readonly ttlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    super();
    const configured = Number(this.configService.get<string>('JWT_EXPIRES_IN'));
    this.ttlSeconds =
      Number.isInteger(configured) && configured > 0
        ? configured
        : AUTH_LIMITS.DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  }

  sign(payload: JwtPayload): string {
    return this.signJwt(payload, this.secret);
  }

  verify(token: string): JwtPayload | null {
    return this.verifyJwt(token, this.secret);
  }

  private get secret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('JWT_SECRET no está configurado');
    }
    return secret;
  }

  // Firma un JWT HS256 compatible con verifyJwt
  private signJwt(payload: JwtPayload, secret: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  // Verifica un JWT HS256 (firma y expiración). Retorna null si es inválido o expiró.
  private verifyJwt(token: string, secret: string): JwtPayload | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;

    try {
      const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
      if (parsedHeader.alg !== 'HS256') return null;

      const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
      const received = Buffer.from(signature, 'base64url');
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload;
      if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
      if (payload.exp * 1000 <= Date.now()) return null;
      return payload;
    } catch {
      return null;
    }
  }
}
