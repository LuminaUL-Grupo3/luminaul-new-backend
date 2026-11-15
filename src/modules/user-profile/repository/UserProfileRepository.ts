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

// Patrón Repository: acceso a perfiles, habilidades, intereses y franjas horarias de SPEC-02.
// El servicio depende de esta abstracción y no ve TypeORM ni SQL.
export abstract class UserProfileRepository {
  // users pertenece a SPEC-01: se consulta con SQL directo (AGENTS.md §3.2)
  abstract findAccount(userId: string): Promise<UserAccount | null>;

  abstract findProfile(userId: string): Promise<ProfileEntity | null>;

  abstract findSkills(userId: string): Promise<string[]>;

  abstract findInterests(userId: string): Promise<string[]>;

  abstract findAvailabilities(userId: string): Promise<AvailabilityEntity[]>;

  abstract findAvailabilitiesByDay(userId: string, dayOfWeek: string): Promise<AvailabilityEntity[]>;

  // Filtra por dueño: una franja ajena se comporta igual que una inexistente
  abstract findOwnAvailability(id: string, userId: string): Promise<AvailabilityEntity | null>;

  abstract createAvailability(userId: string, values: AvailabilityValues): Promise<AvailabilityEntity>;

  abstract saveAvailability(availability: AvailabilityEntity): Promise<AvailabilityEntity>;

  abstract deleteAvailability(id: string): Promise<void>;

  // Unit of Work: perfil, habilidades e intereses cambian juntos
  abstract updateProfile(userId: string, changes: ProfileChanges): Promise<void>;
}
