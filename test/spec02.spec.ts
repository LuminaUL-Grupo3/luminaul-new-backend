import 'reflect-metadata';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { CreateAvailabilityDto, UpdateAvailabilityDto } from '../src/modules/user-profile/dto/availability.dto';
import { UpdateProfileDto } from '../src/modules/user-profile/dto/update-profile.dto';
import { UserProfileController } from '../src/modules/user-profile/user-profile.controller';
import { UserProfileRepository } from '../src/modules/user-profile/user-profile.repository';
import { UserProfileService } from '../src/modules/user-profile/user-profile.service';

const USER = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

const slot = (id: string, dayOfWeek: string, startTime: string, endTime: string) => ({
  id,
  userId: USER,
  dayOfWeek,
  startTime,
  endTime,
  createdAt: new Date(),
});

const profile = {
  userId: USER,
  name: 'Martín Vizcarra',
  bio: null,
  major: null,
  academicCycle: null,
  profilePhotoUrl: null,
  updatedAt: new Date('2026-10-29T14:30:00.000Z'),
};

const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();

function buildRepository() {
  return {
    findAccount: asyncMock().mockResolvedValue({ email: '20210001@aloe.ulima.edu.pe', status: 'active' }),
    findProfile: asyncMock().mockResolvedValue(profile),
    findSkills: asyncMock().mockResolvedValue(['NestJS']),
    findInterests: asyncMock().mockResolvedValue([]),
    findAvailabilities: asyncMock().mockResolvedValue([slot('s1', 'lunes', '14:00:00', '18:00:00')]),
    findAvailabilitiesByDay: asyncMock().mockResolvedValue([]),
    findOwnAvailability: asyncMock().mockResolvedValue(null),
    createAvailability: asyncMock().mockImplementation(async (...args: unknown[]) => ({
      id: 'nuevo',
      userId: args[0],
      ...(args[1] as object),
    })),
    saveAvailability: asyncMock().mockImplementation(async (value) => value),
    deleteAvailability: asyncMock().mockResolvedValue(undefined),
    updateProfile: asyncMock().mockResolvedValue(undefined),
  };
}

const errorsOf = async <T extends object>(type: new () => T, body: object) =>
  (await validate(plainToInstance(type, body))).map((error) => error.property);

describe('SPEC-02: Perfil de Alumno y Matriz de Horarios', () => {
  let repository: ReturnType<typeof buildRepository>;
  let service: UserProfileService;

  beforeEach(() => {
    repository = buildRepository();
    service = new UserProfileService(repository as unknown as UserProfileRepository);
  });

  describe('Seguridad', () => {
    it('todas las rutas de /profiles exigen JwtAuthGuard', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, UserProfileController)).toContain(JwtAuthGuard);
    });
  });

  describe('DTOs', () => {
    const valid = { dayOfWeek: 'lunes', startTime: '14:00', endTime: '16:00' };

    it('acepta una franja válida', async () => {
      expect(await errorsOf(CreateAvailabilityDto, valid)).toEqual([]);
    });

    it.each([
      ['día inválido', { ...valid, dayOfWeek: 'feriado' }, 'dayOfWeek'],
      ['inicio antes de las 07:00', { ...valid, startTime: '06:59' }, 'startTime'],
      ['inicio a las 22:00', { ...valid, startTime: '22:00' }, 'startTime'],
      ['fin después de las 22:59', { ...valid, endTime: '23:00' }, 'endTime'],
      ['formato con segundos', { ...valid, startTime: '14:00:00' }, 'startTime'],
    ])('rechaza %s', async (_name, body, property) => {
      expect(await errorsOf(CreateAvailabilityDto, body)).toContain(property);
    });

    it('la edición admite campos parciales', async () => {
      expect(await errorsOf(UpdateAvailabilityDto, { endTime: '20:00' })).toEqual([]);
    });

    it('rechaza foto que no sea URL y habilidades de más de 50 caracteres', async () => {
      const errors = await errorsOf(UpdateProfileDto, {
        profilePhotoUrl: 'no-es-url',
        skills: ['x'.repeat(51)],
      });
      expect(errors).toEqual(expect.arrayContaining(['profilePhotoUrl', 'skills']));
    });

    it('permite vaciar la foto con null', async () => {
      expect(await errorsOf(UpdateProfileDto, { profilePhotoUrl: null })).toEqual([]);
    });
  });

  describe('Consulta de perfil', () => {
    it('devuelve el contrato StudentProfileDto con horas HH:mm', async () => {
      const result = await service.getProfile(USER);
      expect(result).toMatchObject({
        userId: USER,
        email: '20210001@aloe.ulima.edu.pe',
        skills: ['NestJS'],
        updatedAt: '2026-10-29T14:30:00.000Z',
      });
      expect(result.availabilities[0]).toEqual({
        id: 's1',
        userId: USER,
        dayOfWeek: 'lunes',
        startTime: '14:00',
        endTime: '18:00',
      });
    });

    it('responde 404 si la cuenta fue eliminada', async () => {
      repository.findAccount.mockResolvedValue({ email: 'x', status: 'deleted' });
      await expect(service.getProfile(USER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('responde 404 si no existe', async () => {
      repository.findAccount.mockResolvedValue(null);
      await expect(service.getProfile(USER)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('Actualización de perfil', () => {
    it('normaliza y quita duplicados de habilidades e intereses', async () => {
      await service.updateProfile(USER, {
        skills: [' Docker ', 'Docker', ''],
        interests: ['Cloud'],
      });
      expect(repository.updateProfile).toHaveBeenCalledWith(USER, {
        fields: {},
        skills: ['Docker'],
        interests: ['Cloud'],
      });
    });

    it('no toca habilidades si no se envían', async () => {
      await service.updateProfile(USER, { bio: 'Hola' });
      expect(repository.updateProfile).toHaveBeenCalledWith(USER, { fields: { bio: 'Hola' } });
    });

    it('rechaza un nombre compuesto solo de espacios', async () => {
      await expect(service.updateProfile(USER, { name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.updateProfile).not.toHaveBeenCalled();
    });
  });

  describe('Reglas de franjas horarias', () => {
    const create = (startTime: string, endTime: string) =>
      service.createAvailability(USER, { dayOfWeek: 'lunes', startTime, endTime });

    it('crea una franja dentro del rango', async () => {
      const result = await create('07:00', '22:00');
      expect(result.availability).toMatchObject({ startTime: '07:00', endTime: '22:00' });
    });

    it.each([
      ['inicio igual al fin', '14:00', '14:00'],
      ['inicio posterior al fin', '16:00', '14:00'],
      ['fin después de las 22:00', '21:00', '22:30'],
    ])('rechaza %s con 400', async (_name, start, end) => {
      await expect(create(start, end)).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createAvailability).not.toHaveBeenCalled();
    });

    describe('con una franja existente de 14:00 a 16:00', () => {
      beforeEach(() => {
        repository.findAvailabilitiesByDay.mockResolvedValue([slot('s1', 'lunes', '14:00:00', '16:00:00')]);
      });

      it.each([
        ['cruce por el inicio', '13:00', '15:00'],
        ['cruce por el final', '15:00', '17:00'],
        ['franja contenida', '14:30', '15:30'],
        ['franja que la contiene', '13:00', '17:00'],
        ['franja idéntica', '14:00', '16:00'],
      ])('rechaza %s', async (_name, start, end) => {
        await expect(create(start, end)).rejects.toBeInstanceOf(BadRequestException);
      });

      it.each([
        ['contigua antes', '12:00', '14:00'],
        ['contigua después', '16:00', '18:00'],
      ])('permite %s', async (_name, start, end) => {
        await expect(create(start, end)).resolves.toBeDefined();
      });
    });
  });

  describe('Edición y borrado de franjas', () => {
    it('responde 404 al editar una franja ajena o inexistente', async () => {
      await expect(service.updateAvailability(USER, 'ajena', { endTime: '20:00' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.findOwnAvailability).toHaveBeenCalledWith('ajena', USER);
      expect(repository.saveAvailability).not.toHaveBeenCalled();
    });

    it('responde 404 al borrar una franja ajena o inexistente', async () => {
      await expect(service.deleteAvailability(USER, 'ajena')).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.deleteAvailability).not.toHaveBeenCalled();
    });

    it('una franja no se traslapa consigo misma al editarla', async () => {
      const own = slot('s1', 'lunes', '14:00:00', '16:00:00');
      repository.findOwnAvailability.mockResolvedValue(own);
      repository.findAvailabilitiesByDay.mockResolvedValue([own]);

      const result = await service.updateAvailability(USER, 's1', { endTime: '17:00' });

      expect(result.availability).toMatchObject({ startTime: '14:00', endTime: '17:00' });
    });

    it('la edición valida contra el nuevo día', async () => {
      repository.findOwnAvailability.mockResolvedValue(slot('s1', 'lunes', '14:00:00', '16:00:00'));
      repository.findAvailabilitiesByDay.mockResolvedValue([slot('s2', 'martes', '15:00:00', '17:00:00')]);

      await expect(service.updateAvailability(USER, 's1', { dayOfWeek: 'martes' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.findAvailabilitiesByDay).toHaveBeenCalledWith(USER, 'martes');
    });

    it('la edición parcial respeta los valores guardados', async () => {
      repository.findOwnAvailability.mockResolvedValue(slot('s1', 'lunes', '14:00:00', '16:00:00'));
      await expect(service.updateAvailability(USER, 's1', { startTime: '17:00' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('elimina una franja propia con el mensaje de la spec', async () => {
      repository.findOwnAvailability.mockResolvedValue(slot('s1', 'lunes', '14:00:00', '16:00:00'));
      await expect(service.deleteAvailability(USER, 's1')).resolves.toEqual({
        message: 'Franja horaria eliminada con éxito',
        deletedId: 's1',
      });
    });
  });
});
