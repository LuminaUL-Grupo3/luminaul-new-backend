import { BadRequestException, Injectable } from '@nestjs/common';
import { ProfilesRepository, dayNumber } from './profiles.repository';
import { ProfilePhotoStorage } from './profile-photo.storage';
import { AvailabilityDto, UpdateProfileDto } from './dto/profile.dto';
import { AvailabilityEntity } from './entities/availability.entity';

@Injectable()
export class ProfilesService {
  constructor(private readonly repository: ProfilesRepository, private readonly photos: ProfilePhotoStorage) {}
  private slot(slot: AvailabilityEntity) {
    return { id: slot.id, day_of_week: dayNumber(slot.dayOfWeek), start_time: slot.startTime.slice(0, 5), end_time: slot.endTime.slice(0, 5) };
  }
  async find(id: string) {
    const { profile: p, availability, rating } = await this.repository.find(id);
    return {
      user_id: p.userId, name: p.name, bio: p.bio || '', major: p.major || '',
      academic_cycle: p.academicCycle ? Number(p.academicCycle) : null, photo_url: p.profilePhotoUrl,
      skills: (p.skills || []).map(s => s.name).sort(), interests: (p.interests || []).map(s => s.name).sort(),
      availability: availability.map(s => this.slot(s)).sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)), rating,
    };
  }
  async update(id: string, dto: UpdateProfileDto) {
    await this.repository.update(id, dto);
    return { message: 'Perfil actualizado correctamente.' };
  }
  async photo(id: string, file?: Express.Multer.File) {
    const stored = await this.photos.save(file);
    try { await this.repository.setPhoto(id, stored.url); }
    catch (error) { await stored.remove(); throw error; }
    return { photo_url: stored.url, message: 'Foto actualizada.' };
  }
  async saveAvailability(userId: string, dto: AvailabilityDto, id?: string) {
    if (dto.start_time.slice(0, 5) >= dto.end_time.slice(0, 5)) throw new BadRequestException('La hora de fin debe ser posterior a la hora de inicio.');
    return { ...this.slot(await this.repository.saveAvailability(userId, dto, id)), message: 'Franja guardada.' };
  }
  async deleteAvailability(userId: string, id: string) {
    await this.repository.deleteAvailability(userId, id);
    return { message: 'Franja eliminada.' };
  }
}
