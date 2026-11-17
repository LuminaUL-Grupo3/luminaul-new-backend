import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { HttpStatus, INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { API_PREFIX, configureHttpApp } from '../../../config/http-app.config';
import { SessionService } from '../../auth-security/service/SessionService';
import { AuthException } from '../../auth-security/exception/AuthException';
import { UserEntity } from '../../auth-security/entities/user.entity';
import { UserProfileController } from '../controller/UserProfileController';
import { UserProfileService } from '../service/UserProfileService';
import { UserProfileServiceImpl } from '../service/impl/UserProfileServiceImpl';
import {
  AvailabilityValues,
  ProfileChanges,
  UserAccount,
  UserProfileRepository,
} from '../repository/UserProfileRepository';
import { ProfileEntity } from '../entities/profile.entity';
import { AvailabilityEntity } from '../entities/availability.entity';
import { OperatingHoursRule } from '../strategy/impl/OperatingHoursRule';
import { StartBeforeEndRule } from '../strategy/impl/StartBeforeEndRule';
import { NoOverlapRule } from '../strategy/impl/NoOverlapRule';

/**
 * HU 4.3 - EDITAR HORAS EN EL PERFIL - PRUEBA DE CAJA NEGRA (PCN-04, cap. 10.3.4).
 *
 * Funcionalidad: PUT /api/profiles/me/availability/{availabilityId}
 * Es la funcionalidad de la HU con más campos de entrada:
 *   availabilityId (ruta), dayOfWeek, startTime y endTime (cuerpo).
 *
 * Los casos se diseñan solo con los criterios de aceptación y el contrato del endpoint:
 *   - dayOfWeek: lunes, martes, miercoles, jueves, viernes, sabado o domingo.
 *   - startTime entre 07:00 y 21:59; endTime entre 07:01 y 22:00 (HH:mm).
 *   - 200 si se guarda; 400 si un dato es inválido, si el inicio no es anterior al fin (E3)
 *     o si se cruza con otra franja del mismo día (E4); 404 si la franja no existe o es ajena;
 *     401 sin sesión.
 * Técnicas: particiones de equivalencia y valores límite.
 *
 * La API se levanta con configureHttpApp (igual que main.ts) y se usa solo por HTTP.
 * La base de datos se reemplaza por un repositorio en memoria y la sesión por un
 * SessionService que reconoce un token por alumno.
 * Los valores de una misma clase se recorren con un for tradicional.
 */

const ALUMNO_A = 'a1b2c3d4-e5f6-47a8-b9c0-123456789abc';
const ALUMNO_B = 'b2c3d4e5-f6a7-48b9-8c0d-23456789abcd';
const TOKEN_A = 'token-alumno-a';
const TOKEN_B = 'token-alumno-b';

const FRANJA_LUNES_1 = '11111111-1111-4111-8111-111111111111'; // A: lunes 14:00-16:00 (la que se edita)
const FRANJA_LUNES_2 = '22222222-2222-4222-8222-222222222222'; // A: lunes 17:00-19:00
const FRANJA_MIERCOLES = '33333333-3333-4333-8333-333333333333'; // A: miércoles 10:00-12:00
const FRANJA_DE_B = '44444444-4444-4444-8444-444444444444'; // B: martes 09:00-11:00
const NO_EXISTE = '55555555-5555-4555-8555-555555555555';

const MSG_ACTUALIZADA = 'Franja horaria actualizada con éxito';
const MSG_NO_ENCONTRADA = 'Franja horaria no encontrada';
const MSG_DIA = 'Día inválido';
const MSG_INICIO = 'La hora de inicio debe estar entre 07:00 y 21:59';
const MSG_FIN = 'La hora de fin debe estar entre 07:01 y 22:00';
const MSG_INICIO_FIN = 'La hora de inicio debe ser anterior a la hora de fin';
const MSG_CRUCE = 'La franja horaria se cruza con otra que ya registraste ese día';
const MSG_SIN_TOKEN = 'Falta el token de autenticación';

/**
 * Repositorio en memoria con el mismo contrato que UserProfileRepositoryImpl.
 * Guarda las horas como HH:mm:ss, igual que la columna TIME de PostgreSQL.
 */
class InMemoryUserProfileRepository extends UserProfileRepository {
  readonly franjas = new Map<string, AvailabilityEntity>();

  reiniciar(): void {
    this.franjas.clear();
    this.guardar(FRANJA_LUNES_1, ALUMNO_A, 'lunes', '14:00', '16:00');
    this.guardar(FRANJA_LUNES_2, ALUMNO_A, 'lunes', '17:00', '19:00');
    this.guardar(FRANJA_MIERCOLES, ALUMNO_A, 'miercoles', '10:00', '12:00');
    this.guardar(FRANJA_DE_B, ALUMNO_B, 'martes', '09:00', '11:00');
  }

  private guardar(id: string, userId: string, dia: string, inicio: string, fin: string): void {
    const entidad = new AvailabilityEntity();
    entidad.id = id;
    entidad.userId = userId;
    entidad.dayOfWeek = dia;
    entidad.startTime = inicio + ':00';
    entidad.endTime = fin + ':00';
    entidad.createdAt = new Date('2026-10-20T10:00:00Z');
    this.franjas.set(id, entidad);
  }

  private copia(entidad: AvailabilityEntity): AvailabilityEntity {
    return Object.assign(new AvailabilityEntity(), entidad);
  }

  async findAccount(userId: string): Promise<UserAccount | null> {
    if (userId !== ALUMNO_A && userId !== ALUMNO_B) return null;
    return { email: userId.substring(0, 8) + '@aloe.ulima.edu.pe', status: 'active' };
  }

  async findProfile(userId: string): Promise<ProfileEntity | null> {
    if (userId !== ALUMNO_A && userId !== ALUMNO_B) return null;
    const perfil = new ProfileEntity();
    perfil.userId = userId;
    perfil.name = userId === ALUMNO_A ? 'Alumno A' : 'Alumno B';
    perfil.bio = null;
    perfil.major = 'Ingeniería de Sistemas';
    perfil.academicCycle = '7';
    perfil.profilePhotoUrl = null;
    perfil.updatedAt = new Date('2026-10-20T10:00:00Z');
    return perfil;
  }

  async findSkills(): Promise<string[]> {
    return [];
  }

  async findInterests(): Promise<string[]> {
    return [];
  }

  async findAvailabilities(userId: string): Promise<AvailabilityEntity[]> {
    const resultado: AvailabilityEntity[] = [];
    for (const entidad of this.franjas.values()) {
      if (entidad.userId === userId) resultado.push(this.copia(entidad));
    }
    return resultado;
  }

  async findAvailabilitiesByDay(userId: string, dia: string): Promise<AvailabilityEntity[]> {
    const todas = await this.findAvailabilities(userId);
    const resultado: AvailabilityEntity[] = [];
    for (let i = 0; i < todas.length; i++) {
      if (todas[i].dayOfWeek === dia) resultado.push(todas[i]);
    }
    return resultado;
  }

  async findOwnAvailability(id: string, userId: string): Promise<AvailabilityEntity | null> {
    const entidad = this.franjas.get(id);
    if (!entidad || entidad.userId !== userId) return null;
    return this.copia(entidad);
  }

  async createAvailability(userId: string, valores: AvailabilityValues): Promise<AvailabilityEntity> {
    const entidad = Object.assign(new AvailabilityEntity(), valores);
    entidad.id = randomUUID();
    entidad.userId = userId;
    this.franjas.set(entidad.id, entidad);
    return entidad;
  }

  async saveAvailability(entidad: AvailabilityEntity): Promise<AvailabilityEntity> {
    this.franjas.set(entidad.id, this.copia(entidad));
    return entidad;
  }

  async deleteAvailability(id: string): Promise<void> {
    this.franjas.delete(id);
  }

  async updateProfile(_userId: string, _cambios: ProfileChanges): Promise<void> {
    // No se usa en esta HU.
  }
}

/** Sesión de prueba: cada token identifica a un alumno; cualquier otro es inválido. */
const sesiones = {
  async validate(token: string) {
    let id: string | null = null;
    if (token === TOKEN_A) id = ALUMNO_A;
    if (token === TOKEN_B) id = ALUMNO_B;
    if (id === null) throw new AuthException('Token inválido o expirado', HttpStatus.UNAUTHORIZED);
    const usuario = new UserEntity();
    usuario.id = id;
    return { payload: {}, user: usuario };
  },
};

const repository = new InMemoryUserProfileRepository();
const service = new UserProfileServiceImpl(repository, [
  new OperatingHoursRule(),
  new StartBeforeEndRule(),
  new NoOverlapRule(),
]);

@Module({
  controllers: [UserProfileController],
  providers: [
    { provide: UserProfileService, useValue: service },
    { provide: SessionService, useValue: sesiones },
  ],
})
class EditarHorasTestModule {}

interface Respuesta {
  status: number;
  body: Record<string, unknown>;
}

describe('PCN-04 - PUT /api/profiles/me/availability/{id} (caja negra)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(EditarHorasTestModule, { logger: false });
    configureHttpApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = (await app.getUrl()) + '/' + API_PREFIX;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Cada caso parte de los mismos datos.
    repository.reiniciar();
  });

  // =====================================================
  // CLASES VALIDAS (criterio E1)
  // =====================================================
  it('CN01_franjaPropiaYDatosValidos_debeActualizarYMostrarseEnPerfilPublico', async () => {
    // ACT
    const respuesta = await actualizar(FRANJA_LUNES_1, { dayOfWeek: 'viernes', startTime: '10:00', endTime: '12:00' });
    // ASSERT
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.message).toBe(MSG_ACTUALIZADA);
    const franja = respuesta.body.availability as Record<string, string>;
    expect(franja.dayOfWeek).toBe('viernes');
    expect(franja.startTime).toBe('10:00');
    expect(franja.endTime).toBe('12:00');
    // El perfil público muestra el cambio.
    const publica = await franjaEnPerfilPublico(FRANJA_LUNES_1);
    expect(publica.dayOfWeek).toBe('viernes');
    expect(publica.startTime).toBe('10:00');
  });

  it('CN02_cadaDiaDelDominio_debeActualizar', async () => {
    const dias = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    for (let i = 0; i < dias.length; i++) {
      const respuesta = await actualizar(FRANJA_LUNES_1, { dayOfWeek: dias[i], startTime: '20:00', endTime: '21:00' });
      expect(respuesta.status).toBe(200);
      expect((respuesta.body.availability as Record<string, string>).dayOfWeek).toBe(dias[i]);
    }
  });

  it('CN03_sinDia_debeConservarDiaGuardado', async () => {
    const respuesta = await actualizar(FRANJA_LUNES_1, { startTime: '15:00', endTime: '16:30' });
    expect(respuesta.status).toBe(200);
    expect((respuesta.body.availability as Record<string, string>).dayOfWeek).toBe('lunes');
  });

  it('CN04_cuerpoVacio_debeDejarFranjaIgual', async () => {
    const respuesta = await actualizar(FRANJA_LUNES_1, {});
    expect(respuesta.status).toBe(200);
    await verificarSinCambios();
  });

  // =====================================================
  // VALORES LIMITE DE startTime
  // =====================================================
  it('CN05_inicio0700_limiteInferior_debeActualizar', async () => {
    expect((await actualizar(FRANJA_LUNES_1, { startTime: '07:00', endTime: '08:00' })).status).toBe(200);
  });

  it('CN06_inicio0659_debajoDelLimite_debeRechazar', async () => {
    await verificarRechazo(FRANJA_LUNES_1, { startTime: '06:59', endTime: '08:00' }, 400, MSG_INICIO);
    await verificarSinCambios();
  });

  it('CN07_inicio2159_limiteSuperior_debeActualizar', async () => {
    expect((await actualizar(FRANJA_LUNES_1, { startTime: '21:59', endTime: '22:00' })).status).toBe(200);
  });

  it('CN08_inicio2200_encimaDelLimite_debeRechazar', async () => {
    await verificarRechazo(FRANJA_LUNES_1, { startTime: '22:00', endTime: '22:00' }, 400, MSG_INICIO);
  });

  // =====================================================
  // VALORES LIMITE DE endTime
  // =====================================================
  it('CN09_fin2200_limiteSuperior_debeActualizar', async () => {
    expect((await actualizar(FRANJA_LUNES_1, { startTime: '20:00', endTime: '22:00' })).status).toBe(200);
  });

  it('CN10_fin2201_encimaDelLimite_debeRechazar', async () => {
    await verificarRechazo(FRANJA_LUNES_1, { startTime: '20:00', endTime: '22:01' }, 400, MSG_FIN);
    await verificarSinCambios();
  });

  it('CN11_fin2300_debeRechazar', async () => {
    await verificarRechazo(FRANJA_LUNES_1, { startTime: '20:00', endTime: '23:00' }, 400, MSG_FIN);
  });

  it('CN12_fin0659_debeRechazar', async () => {
    await verificarRechazo(FRANJA_LUNES_1, { startTime: '07:00', endTime: '06:59' }, 400, MSG_FIN);
  });

  // =====================================================
  // FORMATO DE LAS HORAS Y DEL DIA
  // =====================================================
  it('CN13_inicioConFormatoInvalido_debeRechazar', async () => {
    const valores: unknown[] = ['7:00', '14:60', '14h00', 'abc', '', 1400];
    for (let i = 0; i < valores.length; i++) {
      await verificarRechazo(FRANJA_LUNES_1, { startTime: valores[i], endTime: '16:00' }, 400, MSG_INICIO);
    }
  });

  it('CN14_finConFormatoInvalido_debeRechazar', async () => {
    const valores: unknown[] = ['9:00', '16:75', 'abc', '', 1600];
    for (let i = 0; i < valores.length; i++) {
      await verificarRechazo(FRANJA_LUNES_1, { startTime: '14:00', endTime: valores[i] }, 400, MSG_FIN);
    }
  });

  it('CN15_diaFueraDelDominio_debeRechazar', async () => {
    const valores: unknown[] = ['Lunes', 'monday', 'miércoles', 'feriado', '', 1];
    for (let i = 0; i < valores.length; i++) {
      await verificarRechazo(FRANJA_LUNES_1, { dayOfWeek: valores[i] }, 400, MSG_DIA);
    }
    await verificarSinCambios();
  });

  // =====================================================
  // RELACION ENTRE INICIO Y FIN (criterio E3)
  // =====================================================
  it('CN16_inicioIgualAlFin_debeRechazar', async () => {
    await verificarRechazo(FRANJA_LUNES_1, { startTime: '15:00', endTime: '15:00' }, 400, MSG_INICIO_FIN);
  });

  it('CN17_inicioPosteriorAlFin_debeRechazar', async () => {
    await verificarRechazo(FRANJA_LUNES_1, { startTime: '16:00', endTime: '14:00' }, 400, MSG_INICIO_FIN);
    await verificarSinCambios();
  });

  it('CN18_finUnMinutoDespuesDelInicio_debeActualizar', async () => {
    expect((await actualizar(FRANJA_LUNES_1, { startTime: '15:00', endTime: '15:01' })).status).toBe(200);
  });

  it('CN19_soloInicioPosteriorAlFinGuardado_debeRechazar', async () => {
    await verificarRechazo(FRANJA_LUNES_1, { startTime: '17:00' }, 400, MSG_INICIO_FIN);
  });

  // =====================================================
  // CRUCE CON OTRAS FRANJAS (criterio E4)
  // =====================================================
  it('CN20_cruceConOtraFranjaDelMismoDia_debeRechazar', async () => {
    await verificarRechazo(FRANJA_LUNES_1, { dayOfWeek: 'lunes', startTime: '15:00', endTime: '18:00' }, 400, MSG_CRUCE);
    await verificarSinCambios();
  });

  it('CN21_franjaContigua_debeActualizar', async () => {
    expect((await actualizar(FRANJA_LUNES_1, { startTime: '16:00', endTime: '17:00' })).status).toBe(200);
  });

  it('CN22_cruceDeUnMinuto_debeRechazar', async () => {
    await verificarRechazo(FRANJA_LUNES_1, { startTime: '16:00', endTime: '17:01' }, 400, MSG_CRUCE);
  });

  it('CN23_cruceSoloConSuHorarioAnterior_debeActualizar', async () => {
    expect((await actualizar(FRANJA_LUNES_1, { startTime: '14:30', endTime: '16:30' })).status).toBe(200);
  });

  it('CN24_cambioADiaDondeSeCruza_debeRechazar', async () => {
    await verificarRechazo(FRANJA_LUNES_1, { dayOfWeek: 'miercoles', startTime: '11:00', endTime: '13:00' }, 400, MSG_CRUCE);
  });

  it('CN25_igualAFranjaDeOtroAlumno_debeActualizar', async () => {
    expect((await actualizar(FRANJA_LUNES_1, { dayOfWeek: 'martes', startTime: '09:00', endTime: '11:00' })).status).toBe(200);
  });

  // =====================================================
  // availabilityId, SESION Y CUERPO
  // =====================================================
  it('CN26_franjaDeOtroAlumno_debeResponder404', async () => {
    await verificarRechazo(FRANJA_DE_B, { startTime: '12:00', endTime: '13:00' }, 404, MSG_NO_ENCONTRADA);
    const franjaDeB = repository.franjas.get(FRANJA_DE_B) as AvailabilityEntity;
    expect(franjaDeB.startTime).toBe('09:00:00');
    expect(franjaDeB.endTime).toBe('11:00:00');
  });

  it('CN27_uuidQueNoExiste_debeResponder404', async () => {
    await verificarRechazo(NO_EXISTE, { startTime: '12:00', endTime: '13:00' }, 404, MSG_NO_ENCONTRADA);
  });

  it('CN28_idQueNoEsUuid_debeResponder400', async () => {
    const valores = ['123', 'no-es-un-uuid', '11111111-1111-4111-8111-11111111111'];
    for (let i = 0; i < valores.length; i++) {
      const respuesta = await actualizar(valores[i], { startTime: '12:00', endTime: '13:00' });
      expect(respuesta.status).toBe(400);
    }
  });

  it('CN29_sinToken_debeResponder401', async () => {
    const respuesta = await actualizar(FRANJA_LUNES_1, { startTime: '10:00', endTime: '12:00' }, null);
    expect(respuesta.status).toBe(401);
    expect(JSON.stringify(respuesta.body.message)).toContain(MSG_SIN_TOKEN);
    await verificarSinCambios();
  });

  it('CN30_campoNoPrevisto_debeRechazar', async () => {
    const respuesta = await actualizar(FRANJA_LUNES_1, { userId: ALUMNO_B, startTime: '10:00', endTime: '12:00' });
    expect(respuesta.status).toBe(400);
    expect(JSON.stringify(respuesta.body.message)).toContain('userId');
    await verificarSinCambios();
  });

  // =====================================================
  // METODOS DE APOYO
  // =====================================================
  async function actualizar(id: string, cuerpo: Record<string, unknown>, token: string | null = TOKEN_A): Promise<Respuesta> {
    const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token !== null) cabeceras.Authorization = 'Bearer ' + token;
    const respuesta = await fetch(baseUrl + '/profiles/me/availability/' + id, {
      method: 'PUT',
      headers: cabeceras,
      body: JSON.stringify(cuerpo),
    });
    return { status: respuesta.status, body: (await respuesta.json()) as Record<string, unknown> };
  }

  async function verificarRechazo(
    id: string,
    cuerpo: Record<string, unknown>,
    estadoEsperado: number,
    mensajeEsperado: string,
  ): Promise<void> {
    const respuesta = await actualizar(id, cuerpo);
    expect(respuesta.status).toBe(estadoEsperado);
    expect(JSON.stringify(respuesta.body.message)).toContain(mensajeEsperado);
  }

  /** Lo que ve el alumno B en el perfil público del alumno A. */
  async function franjaEnPerfilPublico(id: string): Promise<Record<string, string>> {
    const respuesta = await fetch(baseUrl + '/profiles/' + ALUMNO_A, {
      headers: { Authorization: 'Bearer ' + TOKEN_B },
    });
    const perfil = (await respuesta.json()) as { availabilities: Record<string, string>[] };
    for (let i = 0; i < perfil.availabilities.length; i++) {
      if (perfil.availabilities[i].id === id) return perfil.availabilities[i];
    }
    throw new Error('La franja ' + id + ' no aparece en el perfil público');
  }

  async function verificarSinCambios(): Promise<void> {
    const franja = await franjaEnPerfilPublico(FRANJA_LUNES_1);
    expect(franja.dayOfWeek).toBe('lunes');
    expect(franja.startTime).toBe('14:00');
    expect(franja.endTime).toBe('16:00');
  }
});
