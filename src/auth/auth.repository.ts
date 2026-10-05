import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, LessThan, Repository } from 'typeorm';
import { UserEntity } from '../users/entities/user.entity';
import { ProfileEntity } from '../users/entities/profile.entity';
import { RevokedTokenEntity } from './entities/revoked-token.entity';

@Injectable()
export class AuthRepository {
  constructor(
    private readonly db: DataSource,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(RevokedTokenEntity) private readonly revoked: Repository<RevokedTokenEntity>,
  ) {}

  findByEmail(email: string) {
    return this.users.createQueryBuilder('u').leftJoinAndSelect('u.profile', 'profile')
      .where('LOWER(u.email) = :email AND u.deleted_at IS NULL', { email }).getOne();
  }
  findById(id: string) {
    return this.users.findOne({ where: { id, deletedAt: IsNull() }, relations: ['profile'] });
  }
  isRevoked(tokenHash: string) {
    return this.revoked.exist({ where: { tokenHash } });
  }
  async revoke(tokenHash: string, userId: string, expiresAt: Date) {
    await this.revoked.upsert({ tokenHash, userId, expiresAt }, ['tokenHash']);
    await this.revoked.delete({ expiresAt: LessThan(new Date()) });
  }

  async register(name: string, email: string, passwordHash: string, codeHash: string, expiresAt: Date) {
    try {
      return await this.db.transaction(async (manager) => {
        const exists = await manager.createQueryBuilder(UserEntity, 'u')
          .where('LOWER(u.email) = :email', { email }).getExists();
        if (exists) throw new ConflictException('Este correo ya está registrado. Inicia sesión o solicita otro código.');
        const user = await manager.save(UserEntity, manager.create(UserEntity, {
          email, passwordHash, role: 'student', status: 'pending_verification', isVerified: false,
          verificationToken: codeHash, verificationTokenExpiresAt: expiresAt, verificationAttempts: 0,
          sessionVersion: 0,
        }));
        await manager.save(ProfileEntity, manager.create(ProfileEntity, { userId: user.id, name }));
        return user;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Este correo ya está registrado.');
      throw error;
    }
  }

  async setVerification(id: string, codeHash: string, expiresAt: Date): Promise<boolean> {
    const result = await this.users.update({ id, isVerified: false, status: 'pending_verification', deletedAt: IsNull() }, {
      verificationToken: codeHash, verificationTokenExpiresAt: expiresAt, verificationAttempts: 0,
    });
    return Boolean(result.affected);
  }

  async verifyEmail(email: string, codeHash: string): Promise<'ok' | 'invalid' | 'expired' | 'blocked'> {
    return this.db.transaction(async (manager) => {
      const user = await manager.createQueryBuilder(UserEntity, 'u').setLock('pessimistic_write')
        .where('LOWER(u.email) = :email AND u.deleted_at IS NULL', { email }).getOne();
      if (!user || user.status !== 'pending_verification') return 'invalid';
      if (user.verificationAttempts >= 5) return 'blocked';
      if (!user.verificationTokenExpiresAt || user.verificationTokenExpiresAt.getTime() <= Date.now()) return 'expired';
      if (user.verificationToken !== codeHash) {
        await manager.increment(UserEntity, { id: user.id }, 'verificationAttempts', 1);
        return 'invalid'; // Se confirma el intento fallido antes de devolver el error HTTP.
      }
      await manager.update(UserEntity, { id: user.id }, {
        status: 'active', isVerified: true, verificationToken: null,
        verificationTokenExpiresAt: null, verificationAttempts: 0,
      });
      return 'ok';
    });
  }

  async setReset(id: string, tokenHash: string, expiresAt: Date) {
    await this.users.update({ id, status: 'active', isVerified: true, deletedAt: IsNull() }, {
      resetToken: tokenHash, resetTokenExpiresAt: expiresAt,
    });
  }

  async resetPassword(tokenHash: string, passwordHash: string): Promise<boolean> {
    return this.db.transaction(async (manager) => {
      const user = await manager.findOne(UserEntity, { where: { resetToken: tokenHash, deletedAt: IsNull() }, lock: { mode: 'pessimistic_write' } });
      if (!user || user.status !== 'active' || !user.isVerified || !user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() <= Date.now()) return false;
      await manager.update(UserEntity, { id: user.id }, {
        passwordHash, resetToken: null, resetTokenExpiresAt: null, sessionVersion: user.sessionVersion + 1,
      });
      return true;
    });
  }

  async changePassword(id: string, previousHash: string, passwordHash: string): Promise<boolean> {
    const result = await this.users.createQueryBuilder().update()
      .set({ passwordHash, resetToken: null, resetTokenExpiresAt: null, sessionVersion: () => 'session_version + 1' })
      .where('id = :id AND password_hash = :previousHash AND deleted_at IS NULL', { id, previousHash }).execute();
    return Boolean(result.affected);
  }
}
