import 'reflect-metadata';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'luminaul-spec06-secret-key-2026-secure';
process.env.WEB_ORIGIN = 'http://localhost:5173,http://127.0.0.1:5173';

import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { hash } from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { API_PREFIX, configureHttpApp } from '../src/config/http-app.config';
import { ModerationTaskWorkerService } from '../src/modules/moderation/services/moderation-task-worker.service';
import { ModerationRepository } from '../src/modules/moderation/repositories/moderation.repository';
import { TargetContentType } from '../src/modules/moderation/enums/moderation.enums';

describe('SPEC-06: Moderación y Denuncias (End-to-End Suite Oficial)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;
  let worker: ModerationTaskWorkerService;
  let moderationRepo: ModerationRepository;

  const ts = Date.now();
  const user1Email = `alumno_spec06_${ts}@aloe.ulima.edu.pe`;
  const user2Email = `alumno2_spec06_${ts}@aloe.ulima.edu.pe`;
  const defaultPassword = 'PasswordSegura2026!';

  let user1Id: string;
  let user2Id: string;
  let token1: string;
  let token2: string;
  let testPostId: string;
  let flaggedPostId: string;
  let moderationLogId: string;

  const apiRequest = async (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: { token?: string; body?: unknown } = {},
  ) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;

    const res = await fetch(`${baseUrl}/${API_PREFIX}${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    let body: any = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: res.status, body };
  };

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttpApp(app);


    await app.listen(0);
    const server = app.getHttpServer();
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;

    dataSource = app.get(DataSource);
    worker = app.get(ModerationTaskWorkerService);
    moderationRepo = app.get(ModerationRepository);

    // Preparar usuarios en PostgreSQL
    const passwordHash = await hash(defaultPassword, 10);

    const [u1] = await dataSource.query(
      `INSERT INTO users (email, password_hash, name, role, status, is_verified)
       VALUES ($1, $2, 'Alumno Prueba SPEC06', 'STUDENT', 'active', true)
       RETURNING id`,
      [user1Email, passwordHash],
    );
    user1Id = u1.id;

    const [u2] = await dataSource.query(
      `INSERT INTO users (email, password_hash, name, role, status, is_verified)
       VALUES ($1, $2, 'Alumno Denunciante SPEC06', 'STUDENT', 'active', true)
       RETURNING id`,
      [user2Email, passwordHash],
    );
    user2Id = u2.id;

    // Login usuarios
    const login1 = await apiRequest('POST', '/auth/login', {
      body: { email: user1Email, password: defaultPassword },
    });
    token1 = login1.body.access_token || login1.body.accessToken;

    const login2 = await apiRequest('POST', '/auth/login', {
      body: { email: user2Email, password: defaultPassword },
    });
    token2 = login2.body.access_token || login2.body.accessToken;

    // Crear publicaciones para pruebas
    const [c] = await dataSource.query(`SELECT id FROM courses LIMIT 1`);
    const courseId = c?.id || '00000000-0000-0000-0000-000000000030';

    const [p1] = await dataSource.query(
      `INSERT INTO publications (user_id, course_id, type, description, status)
       VALUES ($1, $2, 'study_group', 'Buscamos 2 personas para repasar temas de matrices.', 'published')
       RETURNING id`,
      [user1Id, courseId],
    );
    testPostId = p1.id;

    const [p2] = await dataSource.query(
      `INSERT INTO publications (user_id, course_id, type, description, status)
       VALUES ($1, $2, 'study_group', 'Vendo examen resuelto y hago compra de notas, es una estafa garantizada.', 'published')
       RETURNING id`,
      [user1Id, courseId],
    );
    flaggedPostId = p2.id;
  }, 30000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (flaggedPostId) {
        await dataSource.query(`DELETE FROM appeals WHERE moderation_log_id IN (SELECT id FROM moderation_logs WHERE content_id = $1)`, [flaggedPostId]);
        await dataSource.query(`DELETE FROM moderation_logs WHERE content_id = $1`, [flaggedPostId]);
        await dataSource.query(`DELETE FROM moderation_tasks WHERE content_id = $1`, [flaggedPostId]);
        await dataSource.query(`DELETE FROM publications WHERE id = $1`, [flaggedPostId]);
      }
      if (testPostId) {
        await dataSource.query(`DELETE FROM reports WHERE target_id = $1`, [testPostId]);
        await dataSource.query(`DELETE FROM moderation_logs WHERE content_id = $1`, [testPostId]);
        await dataSource.query(`DELETE FROM moderation_tasks WHERE content_id = $1`, [testPostId]);
        await dataSource.query(`DELETE FROM publications WHERE id = $1`, [testPostId]);
      }
      if (user1Id) await dataSource.query(`DELETE FROM users WHERE id = $1`, [user1Id]);
      if (user2Id) await dataSource.query(`DELETE FROM users WHERE id = $1`, [user2Id]);
    }
    await app?.close();
  });

  describe('HU 6.1: Reportar contenido inapropiado', () => {
    it('debe registrar un reporte exitosamente y retornar HTTP 201', async () => {
      const res = await apiRequest('POST', '/moderation/reports', {
        token: token2,
        body: {
          targetType: 'publication',
          targetId: testPostId,
          reason: 'Spam o contenido engañoso',
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('éxito');
      expect(res.body.reportId).toBeDefined();
    });

    it('debe rechazar reporte duplicado con HTTP 409 (Ya reportaste este contenido)', async () => {
      const res = await apiRequest('POST', '/moderation/reports', {
        token: token2,
        body: {
          targetType: 'publication',
          targetId: testPostId,
          reason: 'Insisto en que es spam',
        },
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Ya reportaste');
    });

    it('debe listar los reportes enviados por el usuario autenticado', async () => {
      const res = await apiRequest('GET', '/moderation/reports/me', {
        token: token2,
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((r: any) => r.targetId === testPostId)).toBe(true);
    });
  });

  describe('HU 6.2: Moderar contenido automáticamente (Worker en 3 Etapas)', () => {
    it('debe encolar y procesar la publicación infractora ocultándola a status hidden', async () => {
      // Encolar tarea persistida en moderation_tasks
      await moderationRepo.enqueueTask(TargetContentType.PUBLICATION, flaggedPostId, 1);

      // Ejecutar lote con el worker en 3 etapas
      const processedCount = await worker.processBatch(10);
      expect(processedCount).toBeGreaterThanOrEqual(1);

      // Verificar que el contenido en publicaciones pasó a 'hidden'
      const [pub] = await dataSource.query(
        `SELECT status FROM publications WHERE id = $1`,
        [flaggedPostId],
      );
      expect(pub.status).toBe('hidden');

      // Verificar registro en moderation_logs con auditoría completa
      const [log] = await dataSource.query(
        `SELECT id, result, lexical_result, moderation_decision, detected_words 
         FROM moderation_logs WHERE content_id = $1`,
        [flaggedPostId],
      );
      expect(log).toBeDefined();
      expect(log.moderation_decision).toBe('HIDDEN');
      expect(log.lexical_result).toBe('BLOCKED');
      expect(log.detected_words).toContain('estafa');
      moderationLogId = log.id;
    });

    it('debe incrementar automáticamente la versión de la tarea si se re-evalúa un contenido editado', async () => {
      // Re-encolar el mismo contenido ya procesado sin pasar versión fija
      const newTask = await moderationRepo.enqueueTask(TargetContentType.PUBLICATION, flaggedPostId);
      expect(newTask).toBeDefined();
      expect(newTask?.contentVersion).toBe(2);
      expect(newTask?.status).toBe('pending');
    });
  });

  describe('HU 6.3: Historial de contenido moderado propio', () => {
    it('debe listar el contenido propio censurado con flag canAppeal en true', async () => {
      const res = await apiRequest('GET', '/moderation/my-logs', {
        token: token1,
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const myLog = res.body.find((l: any) => l.contentId === flaggedPostId);
      expect(myLog).toBeDefined();
      expect(myLog.canAppeal).toBe(true);
      expect(myLog.appealStatus).toBeNull();
    });

    it('no debe incluir publicaciones aprobadas en el historial de sanciones del alumno', async () => {
      // Encolar y procesar la publicación limpia (testPostId)
      await moderationRepo.enqueueTask(TargetContentType.PUBLICATION, testPostId, 1);
      await worker.processBatch(10);

      const res = await apiRequest('GET', '/moderation/my-logs', {
        token: token1,
      });

      expect(res.status).toBe(200);
      const approvedLog = res.body.find((l: any) => l.contentId === testPostId);
      expect(approvedLog).toBeUndefined();
    });
  });

  describe('HU 6.4: Apelar moderación automática', () => {
    it('debe rechazar apelaciones sobre contenidos aprobados con HTTP 400', async () => {
      const [approvedDbLog] = await dataSource.query(
        `SELECT id FROM moderation_logs WHERE content_id = $1 AND moderation_decision = 'APPROVED'`,
        [testPostId],
      );
      if (approvedDbLog) {
        const res = await apiRequest('POST', '/moderation/appeals', {
          token: token1,
          body: {
            moderationLogId: approvedDbLog.id,
            justification: 'Quiero apelar una publicación que ya fue aprobada.',
          },
        });
        expect(res.status).toBe(400);
      }
    });

    it('debe registrar la apelación exitosamente y retornar HTTP 201', async () => {
      const res = await apiRequest('POST', '/moderation/appeals', {
        token: token1,
        body: {
          moderationLogId,
          justification: 'Fue un error de redacción, era un ejemplo pedagógico para la clase de ética.',
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('Apelación enviada');
      expect(res.body.appealId).toBeDefined();
    });

    it('debe rechazar segunda apelación sobre la misma moderación con HTTP 409', async () => {
      const res = await apiRequest('POST', '/moderation/appeals', {
        token: token1,
        body: {
          moderationLogId,
          justification: 'Vuelvo a apelar la misma sanción.',
        },
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Ya existe una apelación');
    });

    it('debe reflejar appealStatus pending y canAppeal false en el historial tras apelar', async () => {
      const res = await apiRequest('GET', '/moderation/my-logs', {
        token: token1,
      });

      expect(res.status).toBe(200);
      const myLog = res.body.find((l: any) => l.id === moderationLogId);
      expect(myLog).toBeDefined();
      expect(myLog.canAppeal).toBe(false);
      expect(myLog.appealStatus).toBe('pending');
    });
  });
});
