import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';

import { UserProfileRepository } from '../repository/UserProfileRepository';
import { UserProfileServiceImpl } from '../service/impl/UserProfileServiceImpl';
import { AvailabilityEntity } from '../entities/availability.entity';
import { AvailabilityRule } from '../strategy/AvailabilityRule';
import { OperatingHoursRule } from '../strategy/impl/OperatingHoursRule';
import { StartBeforeEndRule } from '../strategy/impl/StartBeforeEndRule';
import { NoOverlapRule } from '../strategy/impl/NoOverlapRule';
import { UpdateAvailabilityDto } from '../dto/availability.dto';

/**
 * HU 4.3 - EDITAR HORAS EN EL PERFIL - PRUEBA DE CAJA BLANCA (PCB-04, cap. 10.2.4).
 *
 * Método bajo prueba: UserProfileServiceImpl.updateAvailability()
 * junto con los métodos privados que ejecuta: findOwnSlot() y assertSlotAvailable().
 *
 * Decisiones del método:
 *   D1  findOwnSlot:          if (!slot)                       franja inexistente o ajena
 *   D2  updateAvailability:   dto.dayOfWeek ?? slot.dayOfWeek  día omitido
 *   D3  updateAvailability:   dto.startTime ?? slot.startTime  inicio omitido
 *   D4  updateAvailability:   dto.endTime ?? slot.endTime      fin omitido
 *   D5  assertSlotAvailable:  for (const rule of this.rules)   alguna regla rechaza la franja
 *
 * V(G) = decisiones + 1 = 5 + 1 = 6.
 *
 * Caminos independientes:
 *   C1  D1 V                          404 y no se guarda
 *   C2  D1 F, D2 F, D3 F, D4 F, D5 F  se guardan el día y las horas enviados
 *   C3  D2 V                          conserva el día guardado
 *   C4  D3 V                          conserva la hora de inicio guardada
 *   C5  D4 V                          conserva la hora de fin guardada
 *   C6  D5 V                          una regla rechaza la franja
 * Casos adicionales sobre D5: C6b, C6c y C6d.
 *
 * Solo el repositorio es un Mock. Las reglas son las clases reales.
 * Las excepciones se capturan con try/catch.
 */

const USUARIO = 'a1b2c3d4-e5f6-47a8-b9c0-123456789abc';
const FRANJA = 'b2c3d4e5-f6a7-48b9-8c0d-23456789abcd';
const OTRA_FRANJA = 'c3d4e5f6-a7b8-49c0-9d1e-3456789abcde';

describe('PCB-04 - updateAvailability() (caja blanca, V(G) = 6)', () => {
  let repository: Mocked<UserProfileRepository>;
  let service: UserProfileServiceImpl;

  beforeEach(() => {
    repository = {
      findOwnAvailability: vi.fn(),
      findAvailabilitiesByDay: vi.fn(),
      saveAvailability: vi.fn(),
    } as unknown as Mocked<UserProfileRepository>;
    const reglas: AvailabilityRule[] = [new OperatingHoursRule(), new StartBeforeEndRule(), new NoOverlapRule()];
    service = new UserProfileServiceImpl(repository, reglas);

    // Escenario base: la franja guardada es lunes 14:00 - 16:00 y no hay otras ese día.
    repository.findOwnAvailability.mockResolvedValue(franja(FRANJA, 'lunes', '14:00:00', '16:00:00'));
    repository.findAvailabilitiesByDay.mockResolvedValue([]);
    repository.saveAvailability.mockImplementation(devolverMismaFranja);
  });

  // =====================================================
  // CAMINO C1 - D1 verdadera
  // =====================================================
  it('C1_franjaInexistenteOAjena_debeLanzar404', async () => {
    // ARRANGE
    repository.findOwnAvailability.mockResolvedValue(null);
    // ACT
    const excepcion = await capturarError({ dayOfWeek: 'martes', startTime: '10:00', endTime: '12:00' });
    // ASSERT
    expect(excepcion).toBeInstanceOf(NotFoundException);
    expect((excepcion as Error).message).toBe('Franja horaria no encontrada');
    expect(repository.findOwnAvailability).toHaveBeenCalledWith(FRANJA, USUARIO);
    expect(repository.findAvailabilitiesByDay).not.toHaveBeenCalled();
    expect(repository.saveAvailability).not.toHaveBeenCalled();
  });

  // =====================================================
  // CAMINO C2 - D1, D2, D3, D4 y D5 falsas
  // =====================================================
  it('C2_tresCamposEnviados_debeGuardarValoresNuevos', async () => {
    // ACT
    const resultado = await service.updateAvailability(USUARIO, FRANJA, {
      dayOfWeek: 'martes',
      startTime: '10:00',
      endTime: '12:00',
    });
    // ASSERT
    expect(resultado.message).toBe('Franja horaria actualizada con éxito');
    expect(resultado.availability.id).toBe(FRANJA);
    expect(resultado.availability.dayOfWeek).toBe('martes');
    expect(resultado.availability.startTime).toBe('10:00');
    expect(resultado.availability.endTime).toBe('12:00');
    expect(repository.findAvailabilitiesByDay).toHaveBeenCalledWith(USUARIO, 'martes');
    expect(repository.saveAvailability).toHaveBeenCalledTimes(1);
  });

  // =====================================================
  // CAMINO C3 - D2 verdadera
  // =====================================================
  it('C3_sinDia_debeConservarDiaGuardado', async () => {
    // ACT
    const resultado = await service.updateAvailability(USUARIO, FRANJA, { startTime: '17:00', endTime: '19:00' });
    // ASSERT
    expect(resultado.availability.dayOfWeek).toBe('lunes');
    expect(resultado.availability.startTime).toBe('17:00');
    expect(resultado.availability.endTime).toBe('19:00');
    expect(repository.findAvailabilitiesByDay).toHaveBeenCalledWith(USUARIO, 'lunes');
  });

  // =====================================================
  // CAMINO C4 - D3 verdadera
  // =====================================================
  it('C4_sinInicio_debeConservarInicioGuardadoEnHHmm', async () => {
    // ACT
    const resultado = await service.updateAvailability(USUARIO, FRANJA, { dayOfWeek: 'lunes', endTime: '18:00' });
    // ASSERT
    // El inicio guardado 14:00:00 se convierte a 14:00.
    expect(resultado.availability.startTime).toBe('14:00');
    expect(resultado.availability.endTime).toBe('18:00');
  });

  // =====================================================
  // CAMINO C5 - D4 verdadera
  // =====================================================
  it('C5_sinFin_debeConservarFinGuardadoEnHHmm', async () => {
    // ACT
    const resultado = await service.updateAvailability(USUARIO, FRANJA, { dayOfWeek: 'lunes', startTime: '15:00' });
    // ASSERT
    expect(resultado.availability.startTime).toBe('15:00');
    expect(resultado.availability.endTime).toBe('16:00');
  });

  // =====================================================
  // CAMINO C6 - D5 verdadera
  // =====================================================
  it('C6_cruceConOtraFranja_debeRechazarSinGuardar', async () => {
    // ARRANGE
    repository.findAvailabilitiesByDay.mockResolvedValue([
      franja(FRANJA, 'lunes', '14:00:00', '16:00:00'),
      franja(OTRA_FRANJA, 'lunes', '17:00:00', '19:00:00'),
    ]);
    // ACT
    const excepcion = await capturarError({ dayOfWeek: 'lunes', startTime: '15:00', endTime: '18:00' });
    // ASSERT
    expect(excepcion).toBeInstanceOf(BadRequestException);
    expect((excepcion as Error).message).toBe('La franja horaria se cruza con otra que ya registraste ese día');
    expect(repository.saveAvailability).not.toHaveBeenCalled();
  });

  // =====================================================
  // CASOS ADICIONALES SOBRE D5
  // =====================================================
  it('C6b_cruceConsigoMisma_debeGuardar', async () => {
    // ARRANGE: la única franja del lunes es la que se edita.
    repository.findAvailabilitiesByDay.mockResolvedValue([franja(FRANJA, 'lunes', '14:00:00', '16:00:00')]);
    // ACT
    const resultado = await service.updateAvailability(USUARIO, FRANJA, {
      dayOfWeek: 'lunes',
      startTime: '15:00',
      endTime: '17:00',
    });
    // ASSERT
    expect(resultado.availability.startTime).toBe('15:00');
    expect(repository.saveAvailability).toHaveBeenCalledTimes(1);
  });

  it('C6c_finDespuesDe22_primeraReglaDebeRechazar', async () => {
    // ACT
    const excepcion = await capturarError({ endTime: '22:30' });
    // ASSERT
    expect(excepcion).toBeInstanceOf(BadRequestException);
    expect((excepcion as Error).message).toBe('La hora de fin debe estar entre 07:01 y 22:00');
    expect(repository.saveAvailability).not.toHaveBeenCalled();
  });

  it('C6d_soloInicioPosteriorAlFinGuardado_debeRechazar', async () => {
    // ACT: solo se envía startTime 17:00 y el fin guardado es 16:00.
    const excepcion = await capturarError({ startTime: '17:00' });
    // ASSERT
    expect(excepcion).toBeInstanceOf(BadRequestException);
    expect((excepcion as Error).message).toBe('La hora de inicio debe ser anterior a la hora de fin');
    expect(repository.saveAvailability).not.toHaveBeenCalled();
  });

  // =====================================================
  // METODOS DE APOYO
  // =====================================================
  function franja(id: string, dia: string, inicio: string, fin: string): AvailabilityEntity {
    const entidad = new AvailabilityEntity();
    entidad.id = id;
    entidad.userId = USUARIO;
    entidad.dayOfWeek = dia;
    entidad.startTime = inicio;
    entidad.endTime = fin;
    entidad.createdAt = new Date('2026-10-20T10:00:00Z');
    return entidad;
  }

  async function devolverMismaFranja(entidad: AvailabilityEntity): Promise<AvailabilityEntity> {
    return entidad;
  }

  async function capturarError(cambios: UpdateAvailabilityDto): Promise<unknown> {
    let excepcion: unknown = null;
    try {
      await service.updateAvailability(USUARIO, FRANJA, cambios);
    } catch (error) {
      excepcion = error;
    }
    expect(excepcion).not.toBeNull();
    return excepcion;
  }
});
