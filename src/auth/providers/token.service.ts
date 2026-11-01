import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_ACCESS_TOKEN_TTL_SECONDS } from '../auth.constants';
import { JwtPayload, signJwt, verifyJwt } from '../token.util';

// Adapter: firma y verificación de JWT. Hoy envuelve el HS256 propio de token.util;
// migrar a @nestjs/jwt solo cambia la implementación registrada en AuthModule.
export abstract class TokenService {
  abstract readonly ttlSeconds: number;
  abstract sign(payload: JwtPayload): string;
  // Retorna null si la firma es inválida o el token expiró
  abstract verify(token: string): JwtPayload | null;
}

@Injectable()
export class HmacTokenService extends TokenService {
  readonly ttlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    super();
    const configured = Number(this.configService.get<string>('JWT_EXPIRES_IN'));
    this.ttlSeconds =
      Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  }

  private get secret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('JWT_SECRET no está configurado');
    }
    return secret;
  }

  sign(payload: JwtPayload): string {
    return signJwt(payload, this.secret);
  }

  verify(token: string): JwtPayload | null {
    return verifyJwt(token, this.secret);
  }
}
