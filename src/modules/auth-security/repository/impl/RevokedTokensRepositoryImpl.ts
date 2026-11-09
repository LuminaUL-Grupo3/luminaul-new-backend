import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { RevokedTokensRepository } from '../RevokedTokensRepository';
import { RevokedTokenEntity } from '../../entities/revoked-token.entity';

// Implementación con TypeORM sobre PostgreSQL
@Injectable()
export class RevokedTokensRepositoryImpl extends RevokedTokensRepository {
  constructor(
    @InjectRepository(RevokedTokenEntity)
    private readonly revokedRepo: Repository<RevokedTokenEntity>,
  ) {
    super();
  }

  isRevoked(tokenHash: string): Promise<boolean> {
    return this.revokedRepo.exists({ where: { tokenHash } });
  }

  async revoke(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
    await this.revokedRepo.upsert({ tokenHash, userId, expiresAt }, ['tokenHash']);
  }

  async purgeExpired(): Promise<void> {
    await this.revokedRepo.delete({ expiresAt: LessThan(new Date()) });
  }
}
