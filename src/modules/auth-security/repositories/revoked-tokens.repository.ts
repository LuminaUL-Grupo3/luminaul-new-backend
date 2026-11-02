import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { RevokedTokenEntity } from '../entities/revoked-token.entity';

// Repository: lista de tokens revocados por logout (se guarda solo el SHA-256)
@Injectable()
export class RevokedTokensRepository {
  constructor(
    @InjectRepository(RevokedTokenEntity)
    private readonly revokedRepo: Repository<RevokedTokenEntity>,
  ) {}

  isRevoked(tokenHash: string): Promise<boolean> {
    return this.revokedRepo.exists({ where: { tokenHash } });
  }

  // Idempotente: revocar dos veces el mismo token no falla
  async revoke(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
    await this.revokedRepo.upsert({ tokenHash, userId, expiresAt }, ['tokenHash']);
  }

  // Un token expirado ya es rechazado por su exp, así que su registro sobra
  async purgeExpired(): Promise<void> {
    await this.revokedRepo.delete({ expiresAt: LessThan(new Date()) });
  }
}
