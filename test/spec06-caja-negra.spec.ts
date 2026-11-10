import 'reflect-metadata';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'luminaul-spec06-secret-key-2026-secure';

import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { hash } from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { API_PREFIX, configureHttpApp } from '../src/config/http-app.config';

// HU 6.1 · Prueba de caja negra (informe cap. 10.3).
// Se diseña solo desde el criterio de aceptación y el contrato de POST /moderation/reports,
// con particiones de equivalencia y valores límite sobre las 5 entradas del formulario:
//   E1 Motivo (selector)            E2 Descripción ("Otro motivo", 1..255 caracteres)
//   E3 Tipo de contenido            E4 Identificador del contenido      E5 Sesión del alumno
// El selector y la descripción llegan al backend en el campo reason; E3 y E4 los pone el botón
// "Reportar" de cada tarjeta y E5 viaja en el encabezado Authorization.
describe('HU 6.1 · Caja negra de POST /moderation/reports', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;

  const ts = Date.now();
  const authorEmail = `autor_cn_${ts}@aloe.ulima.edu.pe`;
  const reporterEmail = `denunciante_cn_${ts}@aloe.ulima.edu.pe`;
  const password = 'PasswordSegura2026!';
  const userIds: string[] = [];
  const postIds: string[] = [];
  let authorToken: string;
  let reporterToken: string;

  const post = async (body: unknown, token?: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}/${API_PREFIX}/moderation/reports`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    return { status: res.status, messages: ([] as string[]).concat(json?.message ?? []) };
  };

  const login = async (email: string): Promise<string> => {
    const res = await fetch(`${baseUrl}/${API_PREFIX}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    return body.access_token || body.accessToken;
  };

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttpApp(app);
    await app.listen(0);
    baseUrl = `http://localhost:${app.getHttpServer().address().port}`;
    dataSource = app.get(DataSource);

    const passwordHash = await hash(password, 10);
    for (const [email, name] of [
      [authorEmail, 'Autora Caja Negra'],
      [reporterEmail, 'Denunciante Caja Negra'],
    ]) {
      const [user] = await dataSource.query(
        `INSERT INTO users (email, password_hash, name, role, status, is_verified)
         VALUES ($1, $2, $3, 'STUDENT', 'active', true) RETURNING id`,
        [email, passwordHash, name],
      );
      userIds.push(user.id);
    }
    authorToken = await login(authorEmail);
    reporterToken = await login(reporterEmail);

    const [course] = await dataSource.query(`SELECT id FROM courses LIMIT 1`);
    for (let i = 0; i < 2; i++) {
      const [publication] = await dataSource.query(
        `INSERT INTO publications (user_id, course_id, type, description, status)
         VALUES ($1, $2, 'study_group', $3, 'published') RETURNING id`,
        [userIds[0], course.id, `Publicación de caja negra ${i + 1}`],
      );
      postIds.push(publication.id);
    }
  }, 30000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DELETE FROM reports WHERE target_id = ANY($1::uuid[])`, [postIds]);
      await dataSource.query(`DELETE FROM moderation_logs WHERE content_id = ANY($1::uuid[])`, [postIds]);
      await dataSource.query(`DELETE FROM moderation_tasks WHERE content_id = ANY($1::uuid[])`, [postIds]);
      await dataSource.query(`DELETE FROM publications WHERE id = ANY($1::uuid[])`, [postIds]);
      await dataSource.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    }
    await app?.close();
  });

  const valid = () => ({
    reason: 'Lenguaje ofensivo o insultos',
    targetType: 'publication',
    targetId: postIds[0],
  });

  it('CN01 · Todas las entradas válidas (motivo sugerido) → 201', async () => {
    const res = await post(valid(), reporterToken);
    expect(res.status).toBe(201);
    expect(res.messages[0]).toContain('Tu reporte fue enviado con éxito');
  });

  it('CN02 · Mismo contenido reportado otra vez → 409', async () => {
    const res = await post(valid(), reporterToken);
    expect(res.status).toBe(409);
    expect(res.messages).toContain('Ya reportaste este contenido anteriormente');
  });

  it('CN03 · "Otro motivo" con descripción de 255 caracteres (límite superior) → 201', async () => {
    const res = await post({ ...valid(), targetId: postIds[1], reason: 'a'.repeat(255) }, reporterToken);
    expect(res.status).toBe(201);
  });

  it('CN04 · Descripción de 256 caracteres (límite + 1) → 400', async () => {
    const res = await post({ ...valid(), reason: 'a'.repeat(256) }, reporterToken);
    expect(res.status).toBe(400);
    expect(res.messages).toContain('El motivo no puede superar los 255 caracteres');
  });

  it('CN05 · Motivo vacío o solo espacios → 400', async () => {
    const res = await post({ ...valid(), reason: '    ' }, reporterToken);
    expect(res.status).toBe(400);
    expect(res.messages).toContain('Debes indicar el motivo del reporte');
  });

  it('CN06 · Tipo de contenido fuera del dominio → 400', async () => {
    const res = await post({ ...valid(), targetType: 'comment' }, reporterToken);
    expect(res.status).toBe(400);
    expect(res.messages).toContain('El tipo de contenido debe ser publication, message o review');
  });

  it('CN07 · Identificador con formato inválido → 400', async () => {
    const res = await post({ ...valid(), targetId: '12345' }, reporterToken);
    expect(res.status).toBe(400);
    expect(res.messages).toContain('El identificador del contenido no es válido');
  });

  it('CN08 · Identificador válido pero inexistente → 404', async () => {
    const res = await post(
      { ...valid(), targetId: '7f1c2b8e-3a4d-4e5f-9a6b-1c2d3e4f5a6b' },
      reporterToken,
    );
    expect(res.status).toBe(404);
    expect(res.messages).toContain('El contenido que intentas reportar no existe o fue eliminado');
  });

  it('CN09 · Sin sesión → 401', async () => {
    const res = await post(valid());
    expect(res.status).toBe(401);
  });

  it('CN10 · Token de sesión alterado → 401', async () => {
    const res = await post(valid(), `${reporterToken}x`);
    expect(res.status).toBe(401);
  });

  it('CN11 · El autor reporta su propia publicación → 400', async () => {
    const res = await post({ ...valid(), targetId: postIds[1] }, authorToken);
    expect(res.status).toBe(400);
    expect(res.messages).toContain('No puedes reportar tu propio contenido');
  });
});
