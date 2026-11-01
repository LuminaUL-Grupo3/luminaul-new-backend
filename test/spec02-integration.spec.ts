import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AddressInfo } from 'net';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { UserProfileRepository } from '../src/modules/user-profile/user-profile.repository';

// Requiere PostgreSQL con init-db.sql cargado (DATABASE_URL). Solo crea y borra datos jest.spec02.*
const EMAIL_PREFIX = 'jest.spec02.';
const PASSWORD = 'PasswordSegura2026!';
const COURSE_NAME = 'SPEC02 Jest Test';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000123';
const SLOTS = '/profiles/me/availability';

interface TestUser {
  id: string;
  email: string;
  token: string;
}

interface ApiResult {
  status: number;
  body: any;
  headers: Headers;
}

describe('Integración HTTP + PostgreSQL: SPEC-02 (Perfil y Horarios)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;
  let alumnoA: TestUser;
  let alumnoB: TestUser;
  let courseId: string;
  let userCounter = 0;

  const request = async (
    path: string,
    options: { method?: string; body?: unknown; token?: string; cookie?: string } = {},
  ): Promise<ApiResult> => {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.cookie) headers.Cookie = options.cookie;

    const response = await fetch(baseUrl + path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return {
      status: response.status,
      body: await response.json().catch(() => null),
      headers: response.headers,
    };
  };

  const createUser = async (): Promise<TestUser> => {
    userCounter += 1;
    const email = `${EMAIL_PREFIX}${userCounter}@aloe.ulima.edu.pe`;
    const registered = await request('/auth/register', {
      method: 'POST',
      body: { email, password: PASSWORD, name: `Alumno ${userCounter}` },
    });
    expect(registered.status).toBe(201);

    const [{ verification_token: code }] = await dataSource.query(
      'SELECT verification_token FROM users WHERE email = $1',
      [email],
    );
    await request('/auth/verify-email', { method: 'POST', body: { email, token: code } });

    const login = await request('/auth/login', {
      method: 'POST',
      body: { email, password: PASSWORD },
    });
    expect(login.status).toBe(200);
    return { id: login.body.user.id, email, token: login.body.accessToken };
  };

  const removeTestUsers = async (): Promise<void> => {
    const match = [`${EMAIL_PREFIX}%`];
    const ids = 'SELECT id FROM users WHERE email LIKE $1';
    await dataSource.query(`DELETE FROM moderation_logs WHERE author_id IN (${ids})`, match);
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', match);
    await dataSource.query('DELETE FROM courses WHERE name = $1', [COURSE_NAME]);
  };

  const createSlot = (user: TestUser, dayOfWeek: string, startTime: string, endTime: string) =>
    request(SLOTS, { method: 'POST', token: user.token, body: { dayOfWeek, startTime, endTime } });

  const countSlots = async (userId: string): Promise<number> => {
    const [{ total }] = await dataSource.query(
      'SELECT COUNT(*)::int AS total FROM availabilities WHERE user_id = $1',
      [userId],
    );
    return total;
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-luminaul-development-2026';

    app = await NestFactory.create(AppModule, { logger: false });
    // Misma configuración global que main.ts
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    dataSource = app.get(DataSource);

    await removeTestUsers();
    alumnoA = await createUser();
    alumnoB = await createUser();
    const [course] = await dataSource.query(
      'INSERT INTO courses (name, cycle) VALUES ($1, 5) RETURNING id',
      [COURSE_NAME],
    );
    courseId = course.id;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await removeTestUsers();
    if (app) await app.close();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM availabilities WHERE user_id = ANY($1::uuid[])', [
      [alumnoA.id, alumnoB.id],
    ]);
  });

  describe('Acceso y sesión', () => {
    // TEST 1: Ninguna ruta de perfil u horario debe responder a quien no inició sesión.
    it.each([
      ['GET', '/profiles/me'],
      ['PUT', '/profiles/me'],
      ['GET', `/profiles/${UNKNOWN_ID}`],
      ['POST', SLOTS],
      ['PUT', `${SLOTS}/${UNKNOWN_ID}`],
      ['DELETE', `${SLOTS}/${UNKNOWN_ID}`],
    ])('%s %s sin token responde 401', async (method, path) => {
      const result = await request(path, { method });
      expect(result.status).toBe(401);
    });

    // TEST 2: Un JWT con la firma alterada no debe aceptarse, aunque se parezca a uno válido.
    it('rechaza un token manipulado', async () => {
      const result = await request('/profiles/me', { token: `${alumnoA.token}x` });
      expect(result.status).toBe(401);
    });

    // TEST 3: El frontend no envía Bearer: inicia sesión y consulta el perfil solo con la cookie.
    it('acepta la sesión por cookie httpOnly, que es la que usa el frontend', async () => {
      const login = await request('/auth/login', {
        method: 'POST',
        body: { email: alumnoA.email, password: PASSWORD },
      });
      const cookie = login.headers.get('set-cookie')!.split(';')[0];

      const result = await request('/profiles/me', { cookie });

      expect(result.status).toBe(200);
      expect(result.body.userId).toBe(alumnoA.id);
    });

    // TEST 4: Tras cerrar sesión, el token queda revocado y ya no da acceso al perfil.
    it('un token cerrado con logout deja de servir', async () => {
      const user = await createUser();
      await request('/auth/logout', { method: 'POST', token: user.token });
      const result = await request('/profiles/me', { token: user.token });
      expect(result.status).toBe(401);
    });

    // TEST 5: Simula la suspensión de SPEC-07: el token que ya tenía el alumno deja de funcionar.
    it('una cuenta suspendida pierde el acceso de inmediato', async () => {
      const user = await createUser();
      await dataSource.query(
        "UPDATE users SET status = 'suspended', tokens_valid_after = NOW() + INTERVAL '1 minute' WHERE id = $1",
        [user.id],
      );
      const result = await request('/profiles/me', { token: user.token });
      expect(result.status).toBe(401);
    });

    // TEST 6: Los errores deben traer statusCode, message, timestamp y path, como en las convenciones globales.
    it('los errores siguen el formato ApiErrorResponse', async () => {
      const result = await request(`/profiles/${UNKNOWN_ID}`, { token: alumnoA.token });
      expect(result.status).toBe(404);
      expect(result.body).toEqual({
        statusCode: 404,
        message: 'Perfil no encontrado',
        timestamp: expect.any(String),
        path: `/profiles/${UNKNOWN_ID}`,
      });
    });
  });

  describe('Consulta de perfiles', () => {
    // TEST 7: Registrarse crea el perfil automáticamente, con el contrato completo y los campos opcionales vacíos.
    it('el registro deja un perfil vacío listo para consultar', async () => {
      const user = await createUser();
      const result = await request('/profiles/me', { token: user.token });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        userId: user.id,
        name: `Alumno ${userCounter}`,
        email: user.email,
        bio: null,
        major: null,
        academicCycle: null,
        profilePhotoUrl: null,
        skills: [],
        interests: [],
        availabilities: [],
        updatedAt: expect.any(String),
      });
    });

    // TEST 8: Un id que no es UUID se rechaza antes de llegar a la base de datos.
    it('/me no se interpreta como un id y un id mal formado responde 400', async () => {
      const result = await request('/profiles/no-es-uuid', { token: alumnoA.token });
      expect(result.status).toBe(400);
    });

    // TEST 9: Un alumno puede consultar el perfil y las franjas de otro para cruzar horarios.
    it('un compañero ve el perfil público con su horario', async () => {
      await createSlot(alumnoA, 'lunes', '14:00', '16:00');
      const result = await request(`/profiles/${alumnoA.id}`, { token: alumnoB.token });

      expect(result.status).toBe(200);
      expect(result.body.userId).toBe(alumnoA.id);
      expect(result.body.availabilities).toHaveLength(1);
    });

    // TEST 10: El borrado lógico de la cuenta oculta el perfil a los demás alumnos.
    it('una cuenta eliminada con DELETE /auth/me deja de tener perfil público', async () => {
      const user = await createUser();
      const removed = await request('/auth/me', { method: 'DELETE', token: user.token });
      expect(removed.status).toBe(200);

      const result = await request(`/profiles/${user.id}`, { token: alumnoA.token });
      expect(result.status).toBe(404);
    });
  });

  describe('Actualización de perfil', () => {
    // TEST 11: Comprueba en la tabla profiles, no solo en la respuesta, que los datos se guardaron.
    it('persiste los datos en profiles', async () => {
      const result = await request('/profiles/me', {
        method: 'PUT',
        token: alumnoA.token,
        body: {
          bio: 'Backend',
          major: 'Ingeniería de Sistemas',
          academicCycle: '7',
          profilePhotoUrl: 'https://avatar.test/a.png',
        },
      });
      expect(result.status).toBe(200);

      const [row] = await dataSource.query('SELECT * FROM profiles WHERE user_id = $1', [alumnoA.id]);
      expect(row).toMatchObject({
        bio: 'Backend',
        major: 'Ingeniería de Sistemas',
        academic_cycle: '7',
        profile_photo_url: 'https://avatar.test/a.png',
      });
    });

    // TEST 12: El nombre vive en dos tablas: ambas deben quedar iguales y sin espacios sobrantes.
    it('cambiar el nombre actualiza profiles, users y /auth/me', async () => {
      const user = await createUser();
      await request('/profiles/me', { method: 'PUT', token: user.token, body: { name: '  Nuevo Nombre  ' } });

      const [profile] = await dataSource.query('SELECT name FROM profiles WHERE user_id = $1', [user.id]);
      const [account] = await dataSource.query('SELECT name FROM users WHERE id = $1', [user.id]);
      const me = await request('/auth/me', { token: user.token });

      expect(profile.name).toBe('Nuevo Nombre');
      expect(account.name).toBe('Nuevo Nombre');
      expect(me.body.name).toBe('Nuevo Nombre');
    });

    // TEST 13: Cada actualización debe registrar una fecha de modificación más reciente.
    it('avanza updatedAt en cada cambio', async () => {
      const before = await request('/profiles/me', { token: alumnoA.token });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const after = await request('/profiles/me', {
        method: 'PUT',
        token: alumnoA.token,
        body: { bio: 'Otra bio' },
      });
      expect(new Date(after.body.updatedAt).getTime()).toBeGreaterThan(
        new Date(before.body.updatedAt).getTime(),
      );
    });

    // TEST 14: Enviar un solo campo no debe vaciar los campos que no se enviaron.
    it('una actualización parcial no borra los demás campos', async () => {
      await request('/profiles/me', {
        method: 'PUT',
        token: alumnoA.token,
        body: { major: 'Sistemas', skills: ['Docker'], interests: ['Cloud'] },
      });
      const result = await request('/profiles/me', {
        method: 'PUT',
        token: alumnoA.token,
        body: { bio: 'Solo bio' },
      });

      expect(result.body).toMatchObject({
        bio: 'Solo bio',
        major: 'Sistemas',
        skills: ['Docker'],
        interests: ['Cloud'],
      });
    });

    // TEST 15: Enviar una lista reemplaza la anterior: limpia espacios y repetidos, y una lista vacía borra todo.
    it('reemplaza habilidades e intereses en sus tablas, sin duplicados', async () => {
      await request('/profiles/me', {
        method: 'PUT',
        token: alumnoA.token,
        body: { skills: ['Java', 'SQL'], interests: ['IA'] },
      });
      const result = await request('/profiles/me', {
        method: 'PUT',
        token: alumnoA.token,
        body: { skills: [' Docker ', 'Docker', '', 'NestJS'], interests: [] },
      });

      const skills = await dataSource.query(
        'SELECT skill_name FROM profile_skills WHERE user_id = $1 ORDER BY skill_name',
        [alumnoA.id],
      );
      const interests = await dataSource.query('SELECT 1 FROM profile_interests WHERE user_id = $1', [
        alumnoA.id,
      ]);
      expect(result.body.skills).toEqual(['Docker', 'NestJS']);
      expect(skills.map((row: { skill_name: string }) => row.skill_name)).toEqual(['Docker', 'NestJS']);
      expect(interests).toHaveLength(0);
    });

    // TEST 16: null limpia bio y foto, pero se ignora en el nombre porque la columna es NOT NULL.
    it('null vacía los campos opcionales y no el nombre', async () => {
      const current = await request('/profiles/me', { token: alumnoA.token });
      const result = await request('/profiles/me', {
        method: 'PUT',
        token: alumnoA.token,
        body: { name: null, bio: null, profilePhotoUrl: null },
      });

      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ name: current.body.name, bio: null, profilePhotoUrl: null });
    });

    // TEST 17: Enviar userId o email en el cuerpo no debe modificar otra cuenta ni el correo propio.
    it('ignora campos ajenos al DTO: no se puede cambiar de dueño ni de correo', async () => {
      const result = await request('/profiles/me', {
        method: 'PUT',
        token: alumnoA.token,
        body: { userId: alumnoB.id, email: 'otro@aloe.ulima.edu.pe', bio: 'Intento' },
      });

      expect(result.status).toBe(200);
      expect(result.body.userId).toBe(alumnoA.id);
      expect(result.body.email).toBe(alumnoA.email);
      const [row] = await dataSource.query('SELECT bio FROM profiles WHERE user_id = $1', [alumnoB.id]);
      expect(row.bio).not.toBe('Intento');
    });

    // TEST 18: Cada dato inválido o que excede su límite debe dar 400 y nunca un error 500 de la base de datos.
    it.each([
      ['nombre de 151 caracteres', { name: 'x'.repeat(151) }],
      ['nombre vacío', { name: '' }],
      ['nombre con solo espacios', { name: '   ' }],
      ['bio de 1001 caracteres', { bio: 'x'.repeat(1001) }],
      ['carrera de 101 caracteres', { major: 'x'.repeat(101) }],
      ['ciclo de 21 caracteres', { academicCycle: 'x'.repeat(21) }],
      ['foto que no es URL', { profilePhotoUrl: 'no-es-url' }],
      ['foto de más de 255 caracteres', { profilePhotoUrl: `https://a.test/${'x'.repeat(250)}` }],
      ['habilidad de 51 caracteres', { skills: ['x'.repeat(51)] }],
      ['habilidades que no son lista', { skills: 123 }],
      ['interés que no es texto', { interests: [1] }],
    ])('rechaza con 400: %s', async (_name, body) => {
      const result = await request('/profiles/me', { method: 'PUT', token: alumnoA.token, body });
      expect(result.status).toBe(400);
    });

    // TEST 19: El valor máximo permitido sí debe guardarse: confirma que las validaciones no son más estrictas que el esquema.
    it('acepta los valores en el límite exacto de cada columna', async () => {
      const result = await request('/profiles/me', {
        method: 'PUT',
        token: alumnoB.token,
        body: {
          name: 'n'.repeat(150),
          bio: 'b'.repeat(1000),
          major: 'm'.repeat(100),
          academicCycle: 'c'.repeat(20),
          skills: ['s'.repeat(50)],
          interests: ['i'.repeat(50)],
        },
      });
      expect(result.status).toBe(200);
    });

    // TEST 20: Fuerza un fallo al insertar habilidades: perfil, nombre y habilidades deben quedar como estaban.
    it('si una parte falla, la transacción no deja cambios a medias', async () => {
      const user = await createUser();
      await request('/profiles/me', {
        method: 'PUT',
        token: user.token,
        body: { bio: 'Original', skills: ['Original'] },
      });

      // Se salta el DTO: skill_name es VARCHAR(50) y el INSERT falla al final de la transacción
      await expect(
        app.get(UserProfileRepository).updateProfile(user.id, {
          fields: { bio: 'Cambiada', name: 'Cambiado' },
          skills: ['x'.repeat(51)],
        }),
      ).rejects.toThrow();

      const result = await request('/profiles/me', { token: user.token });
      const [account] = await dataSource.query('SELECT name FROM users WHERE id = $1', [user.id]);
      expect(result.body.bio).toBe('Original');
      expect(result.body.skills).toEqual(['Original']);
      expect(result.body.name).not.toBe('Cambiado');
      expect(account.name).not.toBe('Cambiado');
    });
  });

  describe('Creación de franjas', () => {
    // TEST 21: PostgreSQL guarda HH:mm:ss, pero la API debe responder siempre HH:mm, como pide el contrato.
    it('guarda TIME en la base y lo devuelve como HH:mm', async () => {
      const result = await createSlot(alumnoA, 'lunes', '14:00', '16:30');
      expect(result.status).toBe(201);
      expect(result.body).toEqual({
        message: 'Franja horaria creada con éxito',
        availability: {
          id: expect.any(String),
          userId: alumnoA.id,
          dayOfWeek: 'lunes',
          startTime: '14:00',
          endTime: '16:30',
        },
      });

      const [row] = await dataSource.query('SELECT * FROM availabilities WHERE id = $1', [
        result.body.availability.id,
      ]);
      expect(row).toMatchObject({
        user_id: alumnoA.id,
        day_of_week: 'lunes',
        start_time: '14:00:00',
        end_time: '16:30:00',
      });

      const profile = await request('/profiles/me', { token: alumnoA.token });
      expect(profile.body.availabilities[0].startTime).toBe('14:00');
    });

    // TEST 22: Los dos extremos del horario permitido forman una franja válida.
    it('acepta el rango operativo completo 07:00 a 22:00', async () => {
      const result = await createSlot(alumnoA, 'martes', '07:00', '22:00');
      expect(result.status).toBe(201);
    });

    // TEST 23: Último minuto en el que puede empezar una franja, según el patrón de la spec.
    it('acepta el último inicio permitido, 21:59', async () => {
      const result = await createSlot(alumnoA, 'martes', '21:59', '22:00');
      expect(result.status).toBe(201);
    });

    // TEST 24: Horas fuera de rango, mal escritas o en orden inválido, y días incorrectos: no debe quedar ninguna fila.
    it.each([
      ['inicio 06:59', 'lunes', '06:59', '08:00'],
      ['inicio 22:00', 'lunes', '22:00', '22:00'],
      ['fin 22:01', 'lunes', '20:00', '22:01'],
      ['fin 23:00', 'lunes', '20:00', '23:00'],
      ['inicio igual al fin', 'lunes', '10:00', '10:00'],
      ['inicio posterior al fin', 'lunes', '12:00', '10:00'],
      ['hora sin cero inicial', 'lunes', '9:00', '10:00'],
      ['minutos inválidos', 'lunes', '10:60', '11:00'],
      ['hora con segundos', 'lunes', '10:00:00', '11:00'],
      ['día en mayúsculas', 'LUNES', '10:00', '11:00'],
      ['día inexistente', 'feriado', '10:00', '11:00'],
    ])('rechaza con 400 sin guardar nada: %s', async (_name, day, start, end) => {
      const result = await createSlot(alumnoA, day, start, end);
      expect(result.status).toBe(400);
      expect(await countSlots(alumnoA.id)).toBe(0);
    });

    // TEST 25: Día, inicio y fin son obligatorios al crear una franja.
    it.each([
      ['sin día', { startTime: '10:00', endTime: '11:00' }],
      ['sin inicio', { dayOfWeek: 'lunes', endTime: '11:00' }],
      ['sin fin', { dayOfWeek: 'lunes', startTime: '10:00' }],
    ])('rechaza con 400 si falta un campo: %s', async (_name, body) => {
      const result = await request(SLOTS, { method: 'POST', token: alumnoA.token, body });
      expect(result.status).toBe(400);
    });

    // TEST 26: El dueño sale de la sesión: un userId en el cuerpo se ignora.
    it('no permite crear una franja a nombre de otro alumno', async () => {
      const result = await request(SLOTS, {
        method: 'POST',
        token: alumnoA.token,
        body: { userId: alumnoB.id, dayOfWeek: 'lunes', startTime: '10:00', endTime: '11:00' },
      });

      expect(result.body.availability.userId).toBe(alumnoA.id);
      expect(await countSlots(alumnoB.id)).toBe(0);
    });

    describe('con una franja guardada de 14:00 a 16:00', () => {
      beforeEach(async () => {
        await createSlot(alumnoA, 'lunes', '14:00', '16:00');
      });

      // TEST 27: Prueba cada forma de cruce con la franja existente, incluido un solapamiento de un solo minuto.
      it.each([
        ['cruce por el inicio', '13:00', '14:01'],
        ['cruce por el final', '15:59', '17:00'],
        ['contenida', '14:30', '15:30'],
        ['contenedora', '13:00', '17:00'],
        ['idéntica', '14:00', '16:00'],
      ])('rechaza el traslape: %s', async (_name, start, end) => {
        const result = await createSlot(alumnoA, 'lunes', start, end);
        expect(result.status).toBe(400);
        expect(await countSlots(alumnoA.id)).toBe(1);
      });

      // TEST 28: Terminar justo cuando empieza otra franja no es un traslape.
      it('permite franjas contiguas antes y después', async () => {
        expect((await createSlot(alumnoA, 'lunes', '12:00', '14:00')).status).toBe(201);
        expect((await createSlot(alumnoA, 'lunes', '16:00', '18:00')).status).toBe(201);
        expect(await countSlots(alumnoA.id)).toBe(3);
      });

      // TEST 29: El traslape solo se evalúa dentro del mismo día.
      it('permite la misma hora otro día', async () => {
        expect((await createSlot(alumnoA, 'martes', '14:00', '16:00')).status).toBe(201);
      });

      // TEST 30: El traslape solo se evalúa entre las franjas del mismo alumno.
      it('permite la misma hora a otro alumno', async () => {
        expect((await createSlot(alumnoB, 'lunes', '14:00', '16:00')).status).toBe(201);
      });
    });
  });

  describe('Edición de franjas', () => {
    let slotId: string;

    beforeEach(async () => {
      const created = await createSlot(alumnoA, 'lunes', '14:00', '16:00');
      slotId = created.body.availability.id;
    });

    const update = (body: object, user: TestUser = alumnoA, id: string = slotId) =>
      request(`${SLOTS}/${id}`, { method: 'PUT', token: user.token, body });

    // TEST 31: Cambiar solo el fin mantiene día e inicio, y el cambio queda guardado en la tabla.
    it('una edición parcial conserva los demás valores y persiste', async () => {
      const result = await update({ endTime: '17:00' });

      expect(result.status).toBe(200);
      expect(result.body.message).toBe('Franja horaria actualizada con éxito');
      expect(result.body.availability).toMatchObject({
        dayOfWeek: 'lunes',
        startTime: '14:00',
        endTime: '17:00',
      });
      const [row] = await dataSource.query('SELECT end_time FROM availabilities WHERE id = $1', [slotId]);
      expect(row.end_time).toBe('17:00:00');
    });

    // TEST 32: Un PUT sin campos es válido y deja la franja como estaba.
    it('un cuerpo vacío no cambia nada', async () => {
      const result = await update({});
      expect(result.status).toBe(200);
      expect(result.body.availability).toMatchObject({ startTime: '14:00', endTime: '16:00' });
    });

    // TEST 33: Al editar se excluye la propia franja de la comparación; si no, nunca se podría ajustar.
    it('una franja no se traslapa consigo misma', async () => {
      expect((await update({ startTime: '14:30', endTime: '15:30' })).status).toBe(200);
    });

    // TEST 34: Si la edición choca con otra franja, se rechaza y la fila conserva su valor anterior.
    it('rechaza el traslape con otra franja y deja la original intacta', async () => {
      await createSlot(alumnoA, 'lunes', '16:00', '18:00');

      expect((await update({ endTime: '16:01' })).status).toBe(400);

      const [row] = await dataSource.query('SELECT end_time FROM availabilities WHERE id = $1', [slotId]);
      expect(row.end_time).toBe('16:00:00');
    });

    // TEST 35: Al mover una franja de día se compara con las franjas de ese nuevo día.
    it('valida el traslape contra el día de destino', async () => {
      await createSlot(alumnoA, 'martes', '15:00', '17:00');
      expect((await update({ dayOfWeek: 'martes' })).status).toBe(400);
      expect((await update({ dayOfWeek: 'miercoles' })).status).toBe(200);
    });

    // TEST 36: Con edición parcial, el inicio nuevo se compara con el fin guardado, y viceversa.
    it('combina el valor nuevo con el guardado para validar el orden', async () => {
      expect((await update({ startTime: '16:00' })).status).toBe(400);
      expect((await update({ endTime: '14:00' })).status).toBe(400);
    });

    // TEST 37: Editar aplica el mismo rango de 07:00 a 22:00 que crear.
    it('rechaza horas fuera de rango', async () => {
      expect((await update({ startTime: '06:00' })).status).toBe(400);
      expect((await update({ endTime: '22:30' })).status).toBe(400);
    });

    // TEST 38: Editar no permite transferir una franja a otro alumno enviando su userId.
    it('un id en el cuerpo no cambia la franja de dueño', async () => {
      const result = await update({ userId: alumnoB.id, endTime: '17:00' });
      expect(result.body.availability.userId).toBe(alumnoA.id);
      expect(await countSlots(alumnoB.id)).toBe(0);
    });

    // TEST 39: Solo el titular puede editar: una franja ajena se comporta como si no existiera.
    it('otro alumno recibe 404 y la franja no cambia', async () => {
      expect((await update({ endTime: '20:00' }, alumnoB)).status).toBe(404);
      const [row] = await dataSource.query('SELECT end_time FROM availabilities WHERE id = $1', [slotId]);
      expect(row.end_time).toBe('16:00:00');
    });

    // TEST 40: Distingue un id válido que no existe de un id mal formado.
    it('responde 404 si no existe y 400 si el id no es UUID', async () => {
      expect((await update({ endTime: '20:00' }, alumnoA, UNKNOWN_ID)).status).toBe(404);
      expect((await update({ endTime: '20:00' }, alumnoA, 'no-es-uuid')).status).toBe(400);
    });
  });

  describe('Eliminación de franjas', () => {
    // TEST 41: A diferencia de los posts, la franja se borra físicamente y la respuesta sigue el contrato.
    it('borra la fila y responde con el mensaje de la spec', async () => {
      const created = await createSlot(alumnoA, 'lunes', '14:00', '16:00');
      const id = created.body.availability.id;

      const result = await request(`${SLOTS}/${id}`, { method: 'DELETE', token: alumnoA.token });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ message: 'Franja horaria eliminada con éxito', deletedId: id });
      expect(await countSlots(alumnoA.id)).toBe(0);
    });

    // TEST 42: Una franja ya eliminada no se puede volver a eliminar.
    it('borrar dos veces responde 404', async () => {
      const created = await createSlot(alumnoA, 'lunes', '14:00', '16:00');
      const path = `${SLOTS}/${created.body.availability.id}`;

      await request(path, { method: 'DELETE', token: alumnoA.token });
      const result = await request(path, { method: 'DELETE', token: alumnoA.token });

      expect(result.status).toBe(404);
    });

    // TEST 43: Solo el titular puede borrar: el intento ajeno no debe eliminar la fila.
    it('otro alumno recibe 404 y la franja sigue guardada', async () => {
      const created = await createSlot(alumnoA, 'lunes', '14:00', '16:00');
      const result = await request(`${SLOTS}/${created.body.availability.id}`, {
        method: 'DELETE',
        token: alumnoB.token,
      });

      expect(result.status).toBe(404);
      expect(await countSlots(alumnoA.id)).toBe(1);
    });

    // TEST 44: Tras borrar una franja, ese horario deja de contar para los traslapes.
    it('liberar una franja permite volver a usar ese horario', async () => {
      const created = await createSlot(alumnoA, 'lunes', '14:00', '16:00');
      await request(`${SLOTS}/${created.body.availability.id}`, { method: 'DELETE', token: alumnoA.token });

      expect((await createSlot(alumnoA, 'lunes', '14:00', '16:00')).status).toBe(201);
    });
  });

  describe('Integración con otros módulos', () => {
    // TEST 45: Conecta SPEC-02 con SPEC-03: editar el perfil debe verse en las publicaciones del autor.
    it('el feed de publicaciones muestra el nombre y la foto actuales del perfil', async () => {
      const user = await createUser();
      const [post] = await dataSource.query(
        `INSERT INTO publications (user_id, course_id, type, description)
         VALUES ($1, $2, 'study_group', 'Publicación de prueba SPEC-02') RETURNING id`,
        [user.id, courseId],
      );
      await request('/profiles/me', {
        method: 'PUT',
        token: user.token,
        body: { name: 'Autor Actualizado', profilePhotoUrl: 'https://avatar.test/autor.png' },
      });

      const feed = await request('/posts?limit=50', { token: user.token });

      expect(feed.status).toBe(200);
      // El controller declara un arreglo y SPEC-03 pide { items }: esta prueba solo cubre al autor
      const items = Array.isArray(feed.body) ? feed.body : feed.body.items;
      const item = items.find((candidate: { id: string }) => candidate.id === post.id);
      expect(item.author).toMatchObject({
        id: user.id,
        name: 'Autor Actualizado',
        profilePhotoUrl: 'https://avatar.test/autor.png',
      });
    });

    // TEST 46: Verifica los ON DELETE CASCADE del esquema: no deben quedar filas huérfanas en las 4 tablas.
    it('borrar el usuario elimina en cascada perfil, habilidades, intereses y franjas', async () => {
      const user = await createUser();
      await request('/profiles/me', {
        method: 'PUT',
        token: user.token,
        body: { skills: ['Docker'], interests: ['Cloud'] },
      });
      await createSlot(user, 'lunes', '10:00', '11:00');

      await dataSource.query('DELETE FROM users WHERE id = $1', [user.id]);

      for (const table of ['profiles', 'profile_skills', 'profile_interests', 'availabilities']) {
        const rows = await dataSource.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [user.id]);
        expect(rows).toHaveLength(0);
      }
    });
  });
});
