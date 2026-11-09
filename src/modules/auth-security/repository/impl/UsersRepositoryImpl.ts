import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { UsersRepository } from '../UsersRepository';
import { UserEntity } from '../../entities/user.entity';
import { EmailAlreadyRegisteredException } from '../../exception/EmailAlreadyRegisteredException';

// Código de PostgreSQL para violación de UNIQUE
const PG_UNIQUE_VIOLATION = '23505';

// Implementación con TypeORM sobre PostgreSQL
@Injectable()
export class UsersRepositoryImpl extends UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.userRepo.exists({ where: { email } });
  }

  build(data: Partial<UserEntity>): UserEntity {
    return this.userRepo.create(data);
  }

  save(user: UserEntity): Promise<UserEntity> {
    return this.userRepo.save(user);
  }

  async update(id: string, changes: Partial<UserEntity>): Promise<void> {
    await this.userRepo.update({ id }, changes);
  }

  // Unit of Work: users y profiles se crean en una única transacción (QueryRunner).
  // El perfil se inserta con SQL directo para no importar ProfileEntity (AGENTS.md §3.2).
  async createWithProfile(user: UserEntity): Promise<UserEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const saved = await queryRunner.manager.save(UserEntity, user);
      await queryRunner.query('INSERT INTO profiles (user_id, name) VALUES ($1, $2)', [
        saved.id,
        saved.name,
      ]);
      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      // Carrera entre dos registros simultáneos con el mismo correo
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string } | undefined)?.code === PG_UNIQUE_VIOLATION
      ) {
        throw new EmailAlreadyRegisteredException();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
