import { NotFoundException, BadRequestException, ValidationPipe } from '@nestjs/common';
import { type Mocked } from 'vitest';
import { UserProfileService } from '../user-profile.service';
import { UserProfileRepository, UserAccount } from '../user-profile.repository';
import { ProfileEntity } from '../entities/profile.entity';
import { AvailabilityEntity } from '../entities/availability.entity';
import { UpdateProfileDto } from '../dto/update-profile.dto';

describe('UserProfileService (Unit)', () => {
  let service: UserProfileService;
  let mockRepo: Mocked<UserProfileRepository>;

  const userId = 'user-uuid-profile-1';

  beforeEach(() => {
    mockRepo = {
      findAccount: vi.fn(),
      findProfile: vi.fn(),
      findSkills: vi.fn(),
      findInterests: vi.fn(),
      findAvailabilities: vi.fn(),
      findAvailabilitiesByDay: vi.fn(),
      updateProfile: vi.fn(),
      createAvailability: vi.fn(),
      findOwnAvailability: vi.fn(),
      saveAvailability: vi.fn(),
      deleteAvailability: vi.fn(),
    } as unknown as Mocked<UserProfileRepository>;

    service = new UserProfileService(mockRepo);
  });

  describe('getProfile', () => {
    it('debe devolver el perfil completo del estudiante (Happy Path)', async () => {
      const fakeAccount: UserAccount = {
        email: 'alumno@aloe.ulima.edu.pe',
        status: 'active',
      };
      const fakeProfile: Partial<ProfileEntity> = {
        userId,
        name: 'Juan Perez',
        bio: 'Estudiante de sistemas',
        major: 'Ingeniería de Sistemas',
        academicCycle: '6',
        profilePhotoUrl: 'https://test.photo/1.png',
        updatedAt: new Date(),
      };

      mockRepo.findAccount.mockResolvedValue(fakeAccount);
      mockRepo.findProfile.mockResolvedValue(fakeProfile as ProfileEntity);
      mockRepo.findSkills.mockResolvedValue(['TypeScript', 'NestJS']);
      mockRepo.findInterests.mockResolvedValue(['Web Development']);
      mockRepo.findAvailabilities.mockResolvedValue([]);

      const result = await service.getProfile(userId);

      expect(result.userId).toBe(userId);
      expect(result.name).toBe('Juan Perez');
      expect(result.skills).toEqual(['TypeScript', 'NestJS']);
      expect(mockRepo.findAccount).toHaveBeenCalledWith(userId);
    });

    it('debe lanzar NotFoundException si la cuenta o perfil no existe', async () => {
      mockRepo.findAccount.mockResolvedValue(null);
      mockRepo.findProfile.mockResolvedValue(null);

      await expect(service.getProfile(userId)).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar NotFoundException si la cuenta fue eliminada (status = deleted)', async () => {
      mockRepo.findAccount.mockResolvedValue({ email: 'a@ulima.edu.pe', status: 'deleted' });
      mockRepo.findProfile.mockResolvedValue({} as ProfileEntity);

      await expect(service.getProfile(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('debe rechazar cualquier intento de enviar el campo name en UpdateProfileDto vía ValidationPipe', async () => {
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
      await expect(
        pipe.transform({ name: 'Hacker Name' }, { type: 'body', metatype: UpdateProfileDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe permitir actualizar otros campos sin aceptar o modificar el nombre institucional', async () => {
      const fakeAccount: UserAccount = {
        email: 'alumno@aloe.ulima.edu.pe',
        status: 'active',
      };
      const fakeProfile: Partial<ProfileEntity> = {
        userId,
        name: 'Martín Vizcarra',
        bio: 'Bio actualizada',
        major: 'Ingeniería de Sistemas',
        academicCycle: '6',
        profilePhotoUrl: null,
        updatedAt: new Date(),
      };
      mockRepo.findAccount.mockResolvedValue(fakeAccount);
      mockRepo.findProfile.mockResolvedValue(fakeProfile as ProfileEntity);
      mockRepo.findSkills.mockResolvedValue([]);
      mockRepo.findInterests.mockResolvedValue([]);
      mockRepo.findAvailabilities.mockResolvedValue([]);
      mockRepo.updateProfile.mockResolvedValue(undefined);

      const result = await service.updateProfile(userId, {
        bio: 'Bio actualizada',
        academicCycle: '6',
      });

      expect(result.bio).toBe('Bio actualizada');
      expect(result.name).toBe('Martín Vizcarra');
      expect(mockRepo.updateProfile).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          fields: expect.not.objectContaining({ name: expect.anything() }),
        }),
      );
    });
  });

  describe('createAvailability', () => {
    it('debe crear franja horaria exitosamente (Happy Path)', async () => {
      mockRepo.findAvailabilitiesByDay.mockResolvedValue([]);
      const fakeSlot: Partial<AvailabilityEntity> = {
        id: 'slot-1',
        userId,
        dayOfWeek: 'lunes',
        startTime: '14:00',
        endTime: '16:00',
        createdAt: new Date(),
      };
      mockRepo.createAvailability.mockResolvedValue(fakeSlot as AvailabilityEntity);

      const result = await service.createAvailability(userId, {
        dayOfWeek: 'lunes',
        startTime: '14:00',
        endTime: '16:00',
      });

      expect(result.availability.dayOfWeek).toBe('lunes');
      expect(result.availability.startTime).toBe('14:00');
      expect(result.availability.endTime).toBe('16:00');
      expect(mockRepo.createAvailability).toHaveBeenCalled();
    });

    it('debe rechazar con BadRequestException ante regla de inversión (16:00 -> 14:00)', async () => {
      await expect(
        service.createAvailability(userId, {
          dayOfWeek: 'lunes',
          startTime: '16:00',
          endTime: '14:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar con BadRequestException ante solapamiento de horarios en el mismo día', async () => {
      const existingSlot: Partial<AvailabilityEntity> = {
        id: 'slot-existing',
        userId,
        dayOfWeek: 'lunes',
        startTime: '14:00',
        endTime: '16:00',
      };
      mockRepo.findAvailabilitiesByDay.mockResolvedValue([existingSlot as AvailabilityEntity]);

      await expect(
        service.createAvailability(userId, {
          dayOfWeek: 'lunes',
          startTime: '15:00',
          endTime: '17:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
