import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';

import { UserProfileRepository } from '../repository/UserProfileRepository';
import { UserProfileService } from '../service/UserProfileService';
import { UserProfileServiceImpl } from '../service/impl/UserProfileServiceImpl';
import { AvailabilityEntity } from '../entities/availability.entity';
import { AvailabilityRule } from '../strategy/AvailabilityRule';
import { OperatingHoursRule } from '../strategy/impl/OperatingHoursRule';
import { StartBeforeEndRule } from '../strategy/impl/StartBeforeEndRule';
import { NoOverlapRule } from '../strategy/impl/NoOverlapRule';
import { UpdateAvailabilityDto } from '../dto/availability.dto';

/**
 * HU 4.3 - EDITAR HORAS EN EL PERFIL - PRUEBAS UNITARIAS (cap. 10.4).
 *
 * Se prueba UserProfileServiceImpl de forma aislada.
 * El repositorio (equivalente al DAO) se reemplaza por un Mock creado con vi.fn().
 * Las tres reglas de validación son las clases reales, igual que las validaciones
 * que en el ejemplo del curso viven dentro del Service.
 *
 * No se utilizan Streams ni métodos como map, filter o some en las pruebas.
 * Las excepciones se capturan con try/catch.
 *
 * Ejecutar:
 *   npm run test:unit -- hu43-availability.unit
 *   npm run test:cov  (reporte de cobertura con @vitest/coverage-v8)
 */

const USUARIO = 'a1b2c3d4-e5f6-47a8-b9c0-123456789abc';
const FRANJA = 'b2c3d4e5-f6a7-48b9-8c0d-23456789abcd';
const OTRA_FRANJA = 'c3d4e5f6-a7b8-49c0-9d1e-3456789abcde';
const INEXISTENTE = '99999999-9999-4999-8999-999999999999';

describe('HU 4.3 - UserProfileService (unitarias con Mock)', () => {
  let repository: Mocked<UserProfileRepository>;
  let service: UserProfileService;

  beforeEach(() => {
    // Mock del repositorio: ningún método accede a PostgreSQL.
    repository = {
      findAccount: vi.fn(),
      findProfile: vi.fn(),
      findSkills: vi.fn(),
      findInterests: vi.fn(),
      findAvailabilities: vi.fn(),
      findAvailabilitiesByDay: vi.fn(),
      findOwnAvailability: vi.fn(),
      createAvailability: vi.fn(),
      saveAvailability: vi.fn(),
      deleteAvailability: vi.fn(),
      updateProfile: vi.fn(),
    } as unknown as Mocked<UserProfileRepository>;

    // Las reglas se registran en el mismo orden que en UserProfileModule.
    const reglas: AvailabilityRule[] = [new OperatingHoursRule(), new StartBeforeEndRule(), new NoOverlapRule()];
    service = new UserProfileServiceImpl(repository, reglas);
  });

  // =====================================================
  // INICIO BLOQUE 01 - Fundamentos y primeras pruebas
  // Consultar las franjas del perfil
  // =====================================================
  // METODO getProfile()
  // =====================================================
  it('getProfile_conFranjas_debeRetornarHorasEnFormatoHHmm', async () => {
    // ARRANGE
    repository.findAccount.mockResolvedValue({ email: 'alumno@aloe.ulima.edu.pe', status: 'active' });
    repository.findProfile.mockResolvedValue(perfil());
    repository.findSkills.mockResolvedValue([]);
    repository.findInterests.mockResolvedValue([]);
    repository.findAvailabilities.mockResolvedValue([franja(FRANJA, 'lunes', '14:00:00', '16:00:00')]);
    // ACT
    const resultado = await service.getProfile(USUARIO);
    // ASSERT
    expect(resultado.availabilities.length).toBe(1);
    expect(resultado.availabilities[0].startTime).toBe('14:00');
    expect(resultado.availabilities[0].endTime).toBe('16:00');
    expect(repository.findAvailabilities).toHaveBeenCalledWith(USUARIO);
  });

  it('getProfile_cuentaInexistente_debeLanzarExcepcion', async () => {
    // ARRANGE
    repository.findAccount.mockResolvedValue(null);
    repository.findProfile.mockResolvedValue(null);
    // ACT
    let excepcion: unknown = null;
    try {
      await service.getProfile(INEXISTENTE);
    } catch (error) {
      excepcion = error;
    }
    // ASSERT
    expect(excepcion).toBeInstanceOf(NotFoundException);
    expect((excepcion as Error).message).toBe('Perfil no encontrado');
    expect(repository.findAvailabilities).not.toHaveBeenCalled();
  });

  // =====================================================
  // INICIO BLOQUE 02 - Mocks y escenarios exitosos
  // Actualizar una franja correctamente (criterio E1)
  // =====================================================
  // METODO updateAvailability()
  // =====================================================
  it('actualizar_valido_debeGuardarFranja', async () => {
    // ARRANGE
    repository.findOwnAvailability.mockResolvedValue(franja(FRANJA, 'lunes', '14:00:00', '16:00:00'));
    repository.findAvailabilitiesByDay.mockResolvedValue([]);
    repository.saveAvailability.mockImplementation(devolverMismaFranja);
    const cambios: UpdateAvailabilityDto = { dayOfWeek: 'martes', startTime: '10:00', endTime: '12:00' };
    // ACT
    const resultado = await service.updateAvailability(USUARIO, FRANJA, cambios);
    // ASSERT
    expect(resultado.message).toBe('Franja horaria actualizada con éxito');
    expect(resultado.availability.dayOfWeek).toBe('martes');
    expect(resultado.availability.startTime).toBe('10:00');
    expect(resultado.availability.endTime).toBe('12:00');
    expect(repository.findOwnAvailability).toHaveBeenCalledWith(FRANJA, USUARIO);
    expect(repository.findAvailabilitiesByDay).toHaveBeenCalledWith(USUARIO, 'martes');
    expect(repository.saveAvailability).toHaveBeenCalledTimes(1);
  });

  it('actualizar_sinDia_debeConservarDiaGuardado', async () => {
    // ARRANGE
    repository.findOwnAvailability.mockResolvedValue(franja(FRANJA, 'lunes', '14:00:00', '16:00:00'));
    repository.findAvailabilitiesByDay.mockResolvedValue([]);
    repository.saveAvailability.mockImplementation(devolverMismaFranja);
    // ACT
    const resultado = await service.updateAvailability(USUARIO, FRANJA, { startTime: '17:00', endTime: '19:00' });
    // ASSERT
    expect(resultado.availability.dayOfWeek).toBe('lunes');
    expect(repository.findAvailabilitiesByDay).toHaveBeenCalledWith(USUARIO, 'lunes');
  });

  it('actualizar_soloFin_debeConservarInicioGuardadoEnHHmm', async () => {
    // ARRANGE
    repository.findOwnAvailability.mockResolvedValue(franja(FRANJA, 'lunes', '14:00:00', '16:00:00'));
    repository.findAvailabilitiesByDay.mockResolvedValue([]);
    repository.saveAvailability.mockImplementation(devolverMismaFranja);
    // ACT
    const resultado = await service.updateAvailability(USUARIO, FRANJA, { endTime: '18:00' });
    // ASSERT
    expect(resultado.availability.startTime).toBe('14:00');
    expect(resultado.availability.endTime).toBe('18:00');
  });

  it('actualizar_cruceConsigoMisma_debeGuardar', async () => {
    // ARRANGE
    // La única franja del lunes es la que se está editando.
    const existente = franja(FRANJA, 'lunes', '14:00:00', '16:00:00');
    repository.findOwnAvailability.mockResolvedValue(existente);
    repository.findAvailabilitiesByDay.mockResolvedValue([franja(FRANJA, 'lunes', '14:00:00', '16:00:00')]);
    repository.saveAvailability.mockImplementation(devolverMismaFranja);
    // ACT
    const resultado = await service.updateAvailability(USUARIO, FRANJA, { startTime: '15:00', endTime: '17:00' });
    // ASSERT
    expect(resultado.availability.startTime).toBe('15:00');
    expect(repository.saveAvailability).toHaveBeenCalledTimes(1);
  });

  // =====================================================
  // INICIO BLOQUE 03 - Validaciones y excepciones
  // Un escenario de validación por cada prueba (E3 y E4)
  // =====================================================
  it('actualizar_finDespuesDe22_debeRechazar', async () => {
    await verificarActualizacionInvalida({ startTime: '20:00', endTime: '22:30' }, [], 'La hora de fin debe estar entre 07:01 y 22:00');
  });

  it('actualizar_inicioIgualAlFin_debeRechazar', async () => {
    await verificarActualizacionInvalida({ startTime: '15:00', endTime: '15:00' }, [], 'La hora de inicio debe ser anterior a la hora de fin');
  });

  it('actualizar_inicioPosteriorAlFin_debeRechazar', async () => {
    await verificarActualizacionInvalida({ startTime: '16:00', endTime: '14:00' }, [], 'La hora de inicio debe ser anterior a la hora de fin');
  });

  it('actualizar_soloInicioPosteriorAlFinGuardado_debeRechazar', async () => {
    // El fin guardado es 16:00 y solo se envía el inicio 17:00.
    await verificarActualizacionInvalida({ startTime: '17:00' }, [], 'La hora de inicio debe ser anterior a la hora de fin');
  });

  it('actualizar_cruceConOtraFranja_debeRechazar', async () => {
    const otra = franja(OTRA_FRANJA, 'lunes', '17:00:00', '19:00:00');
    await verificarActualizacionInvalida({ startTime: '15:00', endTime: '18:00' }, [otra], 'La franja horaria se cruza con otra que ya registraste ese día');
  });

  // =====================================================
  // INICIO BLOQUE 04 - Franja inexistente, eliminación y cobertura
  // Completar las pruebas y revisar el reporte de cobertura
  // =====================================================
  it('actualizar_franjaInexistente_debeLanzarExcepcion', async () => {
    // ARRANGE
    repository.findOwnAvailability.mockResolvedValue(null);
    // ACT
    let excepcion: unknown = null;
    try {
      await service.updateAvailability(USUARIO, INEXISTENTE, { startTime: '10:00', endTime: '12:00' });
    } catch (error) {
      excepcion = error;
    }
    // ASSERT
    expect(excepcion).toBeInstanceOf(NotFoundException);
    expect((excepcion as Error).message).toBe('Franja horaria no encontrada');
    expect(repository.findAvailabilitiesByDay).not.toHaveBeenCalled();
    expect(repository.saveAvailability).not.toHaveBeenCalled();
  });

  // =====================================================
  // METODO deleteAvailability()
  // =====================================================
  it('eliminar_existente_debeEliminar', async () => {
    // ARRANGE
    repository.findOwnAvailability.mockResolvedValue(franja(FRANJA, 'lunes', '14:00:00', '16:00:00'));
    repository.deleteAvailability.mockResolvedValue(undefined);
    // ACT
    const resultado = await service.deleteAvailability(USUARIO, FRANJA);
    // ASSERT
    expect(resultado.message).toBe('Franja horaria eliminada con éxito');
    expect(resultado.deletedId).toBe(FRANJA);
    expect(repository.deleteAvailability).toHaveBeenCalledWith(FRANJA);
  });

  it('eliminar_inexistente_debeLanzarExcepcion', async () => {
    // ARRANGE
    repository.findOwnAvailability.mockResolvedValue(null);
    // ACT
    let excepcion: unknown = null;
    try {
      await service.deleteAvailability(USUARIO, INEXISTENTE);
    } catch (error) {
      excepcion = error;
    }
    // ASSERT
    expect(excepcion).toBeInstanceOf(NotFoundException);
    expect((excepcion as Error).message).toBe('Franja horaria no encontrada');
    expect(repository.deleteAvailability).not.toHaveBeenCalled();
  });

  // =====================================================
  // METODOS DE APOYO COMPARTIDOS POR LOS CUATRO BLOQUES
  // =====================================================
  function franja(id: string, dia: string, inicio: string, fin: string): AvailabilityEntity {
    const entidad = new AvailabilityEntity();
    entidad.id = id;
    entidad.userId = USUARIO;
    entidad.dayOfWeek = dia;
    // PostgreSQL devuelve las columnas TIME como HH:mm:ss
    entidad.startTime = inicio;
    entidad.endTime = fin;
    entidad.createdAt = new Date('2026-10-20T10:00:00Z');
    return entidad;
  }

  function perfil() {
    return {
      userId: USUARIO,
      name: 'Alumno de prueba',
      bio: null,
      major: 'Ingeniería de Sistemas',
      academicCycle: '7',
      profilePhotoUrl: null,
      updatedAt: new Date('2026-10-20T10:00:00Z'),
    };
  }

  async function devolverMismaFranja(entidad: AvailabilityEntity): Promise<AvailabilityEntity> {
    return entidad;
  }

  async function verificarActualizacionInvalida(
    cambios: UpdateAvailabilityDto,
    franjasDelDia: AvailabilityEntity[],
    mensajeEsperado: string,
  ): Promise<void> {
    // ARRANGE: la franja que se edita es lunes 14:00 - 16:00
    repository.findOwnAvailability.mockResolvedValue(franja(FRANJA, 'lunes', '14:00:00', '16:00:00'));
    repository.findAvailabilitiesByDay.mockResolvedValue(franjasDelDia);
    // ACT
    let excepcion: unknown = null;
    try {
      await service.updateAvailability(USUARIO, FRANJA, cambios);
    } catch (error) {
      excepcion = error;
    }
    // ASSERT
    expect(excepcion).toBeInstanceOf(BadRequestException);
    expect((excepcion as Error).message).toBe(mensajeEsperado);
    // Si la franja es inválida, nunca se guarda.
    expect(repository.saveAvailability).not.toHaveBeenCalled();
  }
});
