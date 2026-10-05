import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { ProfileEntity } from './entities/profile.entity';
import { UserEntity } from './entities/user.entity';
import { AvailabilityEntity } from './entities/availability.entity';
import { SkillEntity } from './entities/skill.entity';
import { InterestEntity } from './entities/interest.entity';
import { ReviewEntity } from '../reviews/entities/review.entity';
import { AvailabilityDto, UpdateProfileDto } from './dto/profile.dto';

export function dayNumber(day: string): number {
  if (/^[1-7]$/.test(day)) return Number(day);
  const normalized = day.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].indexOf(normalized) + 1 ||
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(normalized) + 1;
}

@Injectable()
export class ProfilesRepository {
  constructor(private readonly db: DataSource) {}

  async find(id: string) {
    const profile = await this.db.getRepository(ProfileEntity).findOne({
      where: { userId: id, user: { deletedAt: IsNull(), status: 'active', isVerified: true } },
      relations: ['skills', 'interests'],
    });
    if (!profile) throw new NotFoundException('No encontramos este perfil.');
    const availability = await this.db.getRepository(AvailabilityEntity).find({ where: { userId: id }, order: { dayOfWeek: 'ASC', startTime: 'ASC' } });
    const rating = await this.db.getRepository(ReviewEntity).createQueryBuilder('review')
      .select('AVG(review.rating)', 'average').where('review.reviewed_user_id = :id AND review.deleted_at IS NULL AND review.status = :status', { id, status: 'published' }).getRawOne<{ average: string | null }>();
    return { profile, availability, rating: rating?.average ? Math.round(Number(rating.average) * 10) / 10 : null };
  }

  private async lockUser(manager: EntityManager, id: string) {
    const user = await manager.findOne(UserEntity, { where: { id, deletedAt: IsNull(), status: 'active', isVerified: true }, lock: { mode: 'pessimistic_write' } });
    if (!user) throw new NotFoundException('La cuenta no está disponible.');
  }

  async update(id: string, dto: UpdateProfileDto) {
    await this.db.transaction(async manager => {
      await this.lockUser(manager, id);
      const profile = await manager.findOneBy(ProfileEntity, { userId: id });
      if (!profile) throw new NotFoundException('No encontramos tu perfil.');
      profile.name = dto.name;
      if (dto.bio !== undefined) profile.bio = dto.bio;
      if (dto.major !== undefined) profile.major = dto.major;
      if (dto.academic_cycle !== undefined) profile.academicCycle = dto.academic_cycle === null ? null : String(dto.academic_cycle);
      // Se guardan los catálogos compartidos y se reemplazan únicamente las relaciones de este perfil.
      if (dto.skills !== undefined) {
        profile.skills = [];
        for (const name of dto.skills) {
          await manager.getRepository(SkillEntity).upsert({ name }, ['name']);
          profile.skills.push((await manager.findOneByOrFail(SkillEntity, { name })));
        }
      }
      if (dto.interests !== undefined) {
        profile.interests = [];
        for (const name of dto.interests) {
          await manager.getRepository(InterestEntity).upsert({ name }, ['name']);
          profile.interests.push((await manager.findOneByOrFail(InterestEntity, { name })));
        }
      }
      await manager.save(ProfileEntity, profile);
    });
  }

  async setPhoto(id: string, url: string) {
    const result = await this.db.getRepository(ProfileEntity).update({ userId: id }, { profilePhotoUrl: url });
    if (!result.affected) throw new NotFoundException('No encontramos tu perfil.');
  }

  async saveAvailability(userId: string, dto: AvailabilityDto, id?: string) {
    return this.db.transaction(async manager => {
      await this.lockUser(manager, userId);
      const existing = id ? await manager.findOneBy(AvailabilityEntity, { id, userId }) : null;
      if (id && !existing) throw new NotFoundException('No encontramos esa franja en tu horario.');
      const slots = await manager.findBy(AvailabilityEntity, { userId });
      const start = dto.start_time.slice(0, 5), end = dto.end_time.slice(0, 5);
      if (slots.some(slot => slot.id !== id && dayNumber(slot.dayOfWeek) === dto.day_of_week && start < slot.endTime.slice(0, 5) && end > slot.startTime.slice(0, 5)))
        throw new ConflictException('Esta franja se cruza con otra de tu horario.');
      return manager.save(AvailabilityEntity, manager.create(AvailabilityEntity, {
        ...(existing || {}), userId, dayOfWeek: String(dto.day_of_week), startTime: `${start}:00`, endTime: `${end}:00`,
      }));
    });
  }

  async deleteAvailability(userId: string, id: string) {
    const result = await this.db.getRepository(AvailabilityEntity).delete({ id, userId });
    if (!result.affected) throw new NotFoundException('No encontramos esa franja en tu horario.');
  }
}
