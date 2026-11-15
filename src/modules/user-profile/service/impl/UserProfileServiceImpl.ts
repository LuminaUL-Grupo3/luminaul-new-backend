import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { UserProfileService } from '../UserProfileService';
import { AvailabilityContext, AvailabilityRule } from '../../strategy/AvailabilityRule';
import { USER_PROFILE_AVAILABILITY_RULES } from '../../user-profile.constants';
import { UpdateProfileDto } from '../../dto/update-profile.dto';
import { CreateAvailabilityDto, UpdateAvailabilityDto } from '../../dto/availability.dto';
import {
  AvailabilityActionResponseDto,
  AvailabilitySlotDto,
  DeleteAvailabilityResponseDto,
  StudentProfileDto,
} from '../../dto/profile-response.dto';
import { AvailabilityEntity } from '../../entities/availability.entity';
import {
  AvailabilityValues,
  ProfileChanges,
  UserProfileRepository,
} from '../../repository/UserProfileRepository';

// PostgreSQL devuelve TIME como HH:mm:ss; el contrato expone HH:mm
const toHourMinute = (time: string): string => time.slice(0, 5);

const normalizeList = (values: string[]): string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

const toSlotDto = (slot: AvailabilityEntity): AvailabilitySlotDto => ({
  id: slot.id,
  userId: slot.userId,
  dayOfWeek: slot.dayOfWeek,
  startTime: toHourMinute(slot.startTime),
  endTime: toHourMinute(slot.endTime),
});

@Injectable()
export class UserProfileServiceImpl extends UserProfileService {
  constructor(
    private readonly repository: UserProfileRepository,
    @Inject(USER_PROFILE_AVAILABILITY_RULES) private readonly rules: AvailabilityRule[],
  ) {
    super();
  }

  async getProfile(userId: string): Promise<StudentProfileDto> {
    const [account, profile] = await Promise.all([
      this.repository.findAccount(userId),
      this.repository.findProfile(userId),
    ]);
    if (!account || account.status === 'deleted' || !profile) {
      throw new NotFoundException('Perfil no encontrado');
    }

    const [skills, interests, availabilities] = await Promise.all([
      this.repository.findSkills(userId),
      this.repository.findInterests(userId),
      this.repository.findAvailabilities(userId),
    ]);

    return {
      userId: profile.userId,
      name: profile.name,
      email: account.email,
      bio: profile.bio,
      major: profile.major,
      academicCycle: profile.academicCycle,
      profilePhotoUrl: profile.profilePhotoUrl,
      skills,
      interests,
      availabilities: availabilities.map(toSlotDto),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<StudentProfileDto> {
    const changes: ProfileChanges = { fields: {} };
    if (dto.bio !== undefined) changes.fields.bio = dto.bio;
    if (dto.major !== undefined) changes.fields.major = dto.major;
    if (dto.academicCycle !== undefined) changes.fields.academicCycle = dto.academicCycle;
    if (dto.profilePhotoUrl !== undefined) changes.fields.profilePhotoUrl = dto.profilePhotoUrl;
    if (dto.skills) changes.skills = normalizeList(dto.skills);
    if (dto.interests) changes.interests = normalizeList(dto.interests);

    await this.repository.updateProfile(userId, changes);
    return this.getProfile(userId);
  }

  async createAvailability(
    userId: string,
    dto: CreateAvailabilityDto,
  ): Promise<AvailabilityActionResponseDto> {
    await this.assertSlotAvailable(userId, dto);
    const slot = await this.repository.createAvailability(userId, {
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
    });
    return { message: 'Franja horaria creada con éxito', availability: toSlotDto(slot) };
  }

  async updateAvailability(
    userId: string,
    availabilityId: string,
    dto: UpdateAvailabilityDto,
  ): Promise<AvailabilityActionResponseDto> {
    const slot = await this.findOwnSlot(userId, availabilityId);
    const values: AvailabilityValues = {
      dayOfWeek: dto.dayOfWeek ?? slot.dayOfWeek,
      startTime: dto.startTime ?? toHourMinute(slot.startTime),
      endTime: dto.endTime ?? toHourMinute(slot.endTime),
    };
    await this.assertSlotAvailable(userId, values, slot.id);

    const saved = await this.repository.saveAvailability(Object.assign(slot, values));
    return { message: 'Franja horaria actualizada con éxito', availability: toSlotDto(saved) };
  }

  async deleteAvailability(
    userId: string,
    availabilityId: string,
  ): Promise<DeleteAvailabilityResponseDto> {
    const slot = await this.findOwnSlot(userId, availabilityId);
    await this.repository.deleteAvailability(slot.id);
    return { message: 'Franja horaria eliminada con éxito', deletedId: slot.id };
  }

  private async findOwnSlot(userId: string, availabilityId: string): Promise<AvailabilityEntity> {
    const slot = await this.repository.findOwnAvailability(availabilityId, userId);
    if (!slot) {
      throw new NotFoundException('Franja horaria no encontrada');
    }
    return slot;
  }

  // Las reglas (strategy/) se aplican en el orden en que las registra el módulo
  private async assertSlotAvailable(
    userId: string,
    candidate: AvailabilityValues,
    ignoredSlotId?: string,
  ): Promise<void> {
    const sameDay = await this.repository.findAvailabilitiesByDay(userId, candidate.dayOfWeek);
    const ctx: AvailabilityContext = {
      candidate,
      sameDaySlots: sameDay.map((slot) => ({
        id: slot.id,
        startTime: toHourMinute(slot.startTime),
        endTime: toHourMinute(slot.endTime),
      })),
      ignoredSlotId,
    };
    for (const rule of this.rules) {
      rule.validate(ctx);
    }
  }
}
