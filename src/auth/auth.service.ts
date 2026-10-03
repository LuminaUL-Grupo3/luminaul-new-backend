import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { RevokedTokenEntity } from './entities/revoked-token.entity';
import { hashToken, JwtPayload, verifyJwt } from './token.util';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(RevokedTokenEntity)
    private readonly revokedRepo: Repository<RevokedTokenEntity>,
    private readonly configService: ConfigService,
  ) {}

  private get secret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('JWT_SECRET no está configurado');
    }
    return secret;
  }

  // Valida firma/expiración y que el token no haya sido revocado por un logout previo
  async validateToken(token: string): Promise<JwtPayload> {
    const payload = verifyJwt(token, this.secret);
    if (!payload) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (await this.revokedRepo.exist({ where: { tokenHash: hashToken(token) } })) {
      throw new UnauthorizedException('La sesión ya fue cerrada');
    }
    return payload;
  }

  // Cierra sesión revocando el token hasta su expiración. Idempotente.
  async logout(token: string): Promise<void> {
    const payload = verifyJwt(token, this.secret);
    if (!payload) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    await this.revokedRepo.upsert(
      {
        tokenHash: hashToken(token),
        userId: payload.sub,
        expiresAt: new Date(payload.exp * 1000),
      },
      ['tokenHash'],
    );

    // Limpieza oportunista: un token expirado ya es rechazado por su exp
    await this.revokedRepo.delete({ expiresAt: LessThan(new Date()) });
  }
}
