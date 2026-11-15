import { ProfileEntity } from '../entities/profile.entity';
import { AvailabilityEntity } from '../entities/availability.entity';

export interface UserAccount {
  email: string;
  status: string;
}

export interface ProfileChanges {
  fields: Partial<Pick<ProfileEntity, 'bio' | 'major' | 'academicCycle' | 'profilePhotoUrl'>>;
  skills?: string[];
  interests?: string[];
}

export type AvailabilityValues = Pick<AvailabilityEntity, 'dayOfWeek' | 'startTime' | 'endTime'>;

/**
 * Acceso a datos del perfil de usuario. La implementación (TypeORM) está en
 * impl/user-profile.repository.impl.ts.
 */
export abstract class UserProfileRepository {
  abstract findAccount(userId: string): Promise<UserAccount | null>;
  abstract findProfile(userId: string): Promise<ProfileEntity | null>;
  abstract findSkills(userId: string): Promise<string[]>;
  abstract findInterests(userId: string): Promise<string[]>;
  abstract findAvailabilities(userId: string): Promise<AvailabilityEntity[]>;
  abstract findAvailabilitiesByDay(userId: string, dayOfWeek: string): Promise<AvailabilityEntity[]>;
  abstract findOwnAvailability(id: string, userId: string): Promise<AvailabilityEntity | null>;
  abstract createAvailability(userId: string, values: AvailabilityValues): Promise<AvailabilityEntity>;
  abstract saveAvailability(availability: AvailabilityEntity): Promise<AvailabilityEntity>;
  abstract deleteAvailability(id: string): Promise<void>;
  abstract updateProfile(userId: string, changes: ProfileChanges): Promise<void>;
}
