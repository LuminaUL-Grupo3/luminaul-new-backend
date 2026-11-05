import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UserProfileService } from '../user-profile.service';
import { UserProfileRepository, UserAccount } from '../user-profile.repository';
import { ProfileEntity } from '../entities/profile.entity';
import { AvailabilityEntity } from '../entities/availability.entity';

describe('UserProfileService (Unit)', () => {
  let service: UserProfileService;
  let mockRepo: jest.Mocked<UserProfileRepository>;

  const userId = 'user-uuid-profile-1';

  beforeEach(() => {
    mockRepo = {
      findAccount: jest.fn(),
      findProfile: jest.fn(),
      findSkills: jest.fn(),
      findInterests: jest.fn(),
      findAvailabilities: jest.fn(),
      findAvailabilitiesByDay: jest.fn(),
      updateProfile: jest.fn(),
      createAvailability: jest.fn(),
      findOwnAvailability: jest.fn(),
      saveAvailability: jest.fn(),
      deleteAvailability: jest.fn(),
    } as unknown as jest.Mocked<UserProfileRepository>;

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
    it('debe rechazar con BadRequestException si el nombre enviado es vacío', async () => {
      await expect(
        service.updateProfile(userId, { name: '   ' }),
      ).rejects.toThrow(BadRequestException);
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
