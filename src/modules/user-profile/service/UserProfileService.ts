import { UpdateProfileDto } from '../dto/update-profile.dto';
import { CreateAvailabilityDto, UpdateAvailabilityDto } from '../dto/availability.dto';
import {
  AvailabilityActionResponseDto,
  DeleteAvailabilityResponseDto,
  StudentProfileDto,
} from '../dto/profile-response.dto';

// Casos de uso de SPEC-02: perfil del alumno y su matriz de disponibilidad horaria
export abstract class UserProfileService {
  abstract getProfile(userId: string): Promise<StudentProfileDto>;

  abstract updateProfile(userId: string, dto: UpdateProfileDto): Promise<StudentProfileDto>;

  abstract createAvailability(
    userId: string,
    dto: CreateAvailabilityDto,
  ): Promise<AvailabilityActionResponseDto>;

  abstract updateAvailability(
    userId: string,
    availabilityId: string,
    dto: UpdateAvailabilityDto,
  ): Promise<AvailabilityActionResponseDto>;

  abstract deleteAvailability(
    userId: string,
    availabilityId: string,
  ): Promise<DeleteAvailabilityResponseDto>;
}
