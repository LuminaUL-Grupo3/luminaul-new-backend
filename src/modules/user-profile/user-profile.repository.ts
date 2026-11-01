import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProfileEntity } from './entities/profile.entity';
import { AvailabilityEntity } from './entities/availability.entity';
import { ProfileSkillEntity } from './entities/profile-skill.entity';
import { ProfileInterestEntity } from './entities/profile-interest.entity';

export interface UserAccount {
  email: string;
  status: string;
}

export interface ProfileChanges {
  fields: Partial<Pick<ProfileEntity, 'name' | 'bio' | 'major' | 'academicCycle' | 'profilePhotoUrl'>>;
  skills?: string[];
  interests?: string[];
}

export type AvailabilityValues = Pick<AvailabilityEntity, 'dayOfWeek' | 'startTime' | 'endTime'>;

@Injectable()
export class UserProfileRepository {
  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(AvailabilityEntity)
    private readonly availabilities: Repository<AvailabilityEntity>,
    @InjectRepository(ProfileSkillEntity)
    private readonly skills: Repository<ProfileSkillEntity>,
    @InjectRepository(ProfileInterestEntity)
    private readonly interests: Repository<ProfileInterestEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // users pertenece a SPEC-01: se consulta con SQL directo (AGENTS.md §3.2)
  async findAccount(userId: string): Promise<UserAccount | null> {
    const rows: UserAccount[] = await this.dataSource.query(
      'SELECT email, status FROM users WHERE id = $1',
      [userId],
    );
    return rows[0] ?? null;
  }

  findProfile(userId: string): Promise<ProfileEntity | null> {
    return this.profiles.findOne({ where: { userId } });
  }

  async findSkills(userId: string): Promise<string[]> {
    const rows = await this.skills.find({ where: { userId }, order: { skillName: 'ASC' } });
    return rows.map((row) => row.skillName);
  }

  async findInterests(userId: string): Promise<string[]> {
    const rows = await this.interests.find({ where: { userId }, order: { interestName: 'ASC' } });
    return rows.map((row) => row.interestName);
  }

  findAvailabilities(userId: string): Promise<AvailabilityEntity[]> {
    return this.availabilities.find({ where: { userId }, order: { startTime: 'ASC' } });
  }

  findAvailabilitiesByDay(userId: string, dayOfWeek: string): Promise<AvailabilityEntity[]> {
    return this.availabilities.find({ where: { userId, dayOfWeek } });
  }

  // Filtra por dueño: una franja ajena se comporta igual que una inexistente
  findOwnAvailability(id: string, userId: string): Promise<AvailabilityEntity | null> {
    return this.availabilities.findOne({ where: { id, userId } });
  }

  createAvailability(userId: string, values: AvailabilityValues): Promise<AvailabilityEntity> {
    return this.availabilities.save(this.availabilities.create({ userId, ...values }));
  }

  saveAvailability(availability: AvailabilityEntity): Promise<AvailabilityEntity> {
    return this.availabilities.save(availability);
  }

  async deleteAvailability(id: string): Promise<void> {
    await this.availabilities.delete({ id });
  }

  // Unit of Work: perfil, nombre de la cuenta, habilidades e intereses cambian juntos
  async updateProfile(userId: string, changes: ProfileChanges): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(ProfileEntity, { userId }, { ...changes.fields, updatedAt: new Date() });

      if (changes.fields.name !== undefined) {
        await manager.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [
          changes.fields.name,
          userId,
        ]);
      }
      if (changes.skills) {
        await manager.delete(ProfileSkillEntity, { userId });
        await manager.insert(
          ProfileSkillEntity,
          changes.skills.map((skillName) => ({ userId, skillName })),
        );
      }
      if (changes.interests) {
        await manager.delete(ProfileInterestEntity, { userId });
        await manager.insert(
          ProfileInterestEntity,
          changes.interests.map((interestName) => ({ userId, interestName })),
        );
      }
    });
  }
}
