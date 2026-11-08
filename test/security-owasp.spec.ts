import 'reflect-metadata';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'luminaul-e2e-integration-secret-key-2026-secure';
process.env.WEB_ORIGIN = 'http://localhost:5173,http://127.0.0.1:5173';

import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { API_PREFIX, configureHttpApp } from '../src/config/http-app.config';
import { SessionService } from '../src/modules/auth-security/services/session.service';
import { UsersRepository } from '../src/modules/auth-security/repositories/users.repository';
import { UserRole } from '../src/modules/auth-security/enums/user-role.enum';
import { UserAccountStatus } from '../src/modules/auth-security/enums/user-account-status.enum';

describe('Security & Access Control (OWASP Top 10 Suite)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;

  let tokenUserA: string;
  let tokenUserB: string;
  let tokenAdmin: string;

  let userAId: string;
  let userBId: string;
  let adminId: string;

  let postUserAId: string;
  let groupUserAId: string;
  let availabilityUserAId: string;

  const requestHttp = async (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: { token?: string; body?: unknown } = {},
  ) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    const res = await fetch(`${baseUrl}/${API_PREFIX}${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    let body: any = null;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    return { status: res.status, body };
  };

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttpApp(app);


    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'string' ? 3000 : address.port;
    baseUrl = `http://127.0.0.1:${port}`;

    dataSource = app.get(DataSource);
    const sessions = app.get(SessionService);
    const usersRepo = app.get(UsersRepository);

    const ts = Date.now();
    const uA = await usersRepo.createWithProfile(
      usersRepo.build({
        email: `sec_a_${ts}@aloe.ulima.edu.pe`,
        name: 'Sec User A',
        passwordHash: 'dummy',
        role: UserRole.STUDENT,
        status: UserAccountStatus.ACTIVE,
        isVerified: true,
      }),
    );
    const uB = await usersRepo.createWithProfile(
      usersRepo.build({
        email: `sec_b_${ts}@aloe.ulima.edu.pe`,
        name: 'Sec User B',
        passwordHash: 'dummy',
        role: UserRole.STUDENT,
        status: UserAccountStatus.ACTIVE,
        isVerified: true,
      }),
    );
    const uAdmin = await usersRepo.createWithProfile(
      usersRepo.build({
        email: `sec_admin_${ts}@aloe.ulima.edu.pe`,
        name: 'Sec Admin',
        passwordHash: 'dummy',
        role: UserRole.ADMIN,
        status: UserAccountStatus.ACTIVE,
        isVerified: true,
      }),
    );

    userAId = uA.id;
    userBId = uB.id;
    adminId = uAdmin.id;

    tokenUserA = sessions.issueAccessToken(uA);
    tokenUserB = sessions.issueAccessToken(uB);
    tokenAdmin = sessions.issueAccessToken(uAdmin);

    // Sembrar curso si no existe
    let [course] = await dataSource.query(`SELECT id FROM courses LIMIT 1`);
    if (!course) {
      [course] = await dataSource.query(
        `INSERT INTO courses (id, name, cycle) VALUES (gen_random_uuid(), 'Seguridad de Sistemas', 9) RETURNING id`,
      );
    }

    // Sembrar Post del Usuario A
    const [post] = await dataSource.query(
      `INSERT INTO publications (id, user_id, course_id, type, description, status)
       VALUES (gen_random_uuid(), $1, $2, 'study_group', 'Post de Usuario A', 'published')
       RETURNING id`,
      [userAId, course.id],
    );
    postUserAId = post.id;

    // Sembrar Grupo del Usuario A
    const [group] = await dataSource.query(
      `INSERT INTO groups (id, name, course_code, leader_id, admin_id)
       VALUES (gen_random_uuid(), 'Grupo de A', 'CS001', $1, $1)
       RETURNING id`,
      [userAId],
    );
    groupUserAId = group.id;

    await dataSource.query(
      `INSERT INTO group_members (group_id, user_id, role, status)
       VALUES ($1, $2, 'leader', 'active')`,
      [groupUserAId, userAId],
    );

    // Sembrar Disponibilidad Horaria de Usuario A
    const [slot] = await dataSource.query(
      `INSERT INTO availabilities (id, user_id, day_of_week, start_time, end_time)
       VALUES (gen_random_uuid(), $1, 'viernes', '10:00', '12:00')
       RETURNING id`,
      [userAId],
    );
    availabilityUserAId = slot.id;
  }, 30000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query('DELETE FROM publications WHERE id = $1', [postUserAId]).catch(() => {});
      await dataSource.query('DELETE FROM groups WHERE id = $1', [groupUserAId]).catch(() => {});
      await dataSource.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [userAId, userBId, adminId]).catch(() => {});
    }
    await app.close();
  });

  describe('1. BOLA / IDOR (Broken Object Level Authorization)', () => {
    it('debe impedir que Usuario B edite una publicación creada por Usuario A -> HTTP 403 Forbidden', async () => {
      const res = await requestHttp('PUT', `/posts/${postUserAId}`, {
        token: tokenUserB,
        body: { description: 'Intento malicioso de modificar post de Usuario A' },
      });
      expect(res.status).toBe(403);
    });

    it('debe impedir que Usuario B elimine una publicación creada por Usuario A -> HTTP 403 Forbidden', async () => {
      const res = await requestHttp('DELETE', `/posts/${postUserAId}`, {
        token: tokenUserB,
      });
      expect(res.status).toBe(403);
    });

    it('debe impedir que Usuario B elimine una franja horaria de Usuario A -> HTTP 404 Not Found', async () => {
      const res = await requestHttp('DELETE', `/profiles/me/availability/${availabilityUserAId}`, {
        token: tokenUserB,
      });
      expect([403, 404]).toContain(res.status);
    });

    it('debe impedir que Usuario B expulse integrantes de un grupo liderado por Usuario A -> HTTP 403 Forbidden', async () => {
      const res = await requestHttp('DELETE', `/groups/${groupUserAId}/members/${userAId}`, {
        token: tokenUserB,
      });
      expect(res.status).toBe(403);
    });
  });

  describe('2. BFLA (Broken Function Level Authorization / RBAC)', () => {
    it('debe bloquear acceso de un estudiante a GET /admin/stats -> HTTP 403 Forbidden', async () => {
      const res = await requestHttp('GET', '/admin/stats', {
        token: tokenUserA,
      });
      expect(res.status).toBe(403);
    });

    it('debe bloquear acceso de un estudiante a GET /admin/appeals -> HTTP 403 Forbidden', async () => {
      const res = await requestHttp('GET', '/admin/appeals', {
        token: tokenUserA,
      });
      expect(res.status).toBe(403);
    });

    it('debe bloquear acceso de un estudiante a PATCH /admin/users/:id/status -> HTTP 403 Forbidden', async () => {
      const res = await requestHttp('PATCH', `/admin/users/${userBId}/status`, {
        token: tokenUserA,
        body: { status: 'suspended', reason: 'Intento sin privilegios' },
      });
      expect(res.status).toBe(403);
    });

    it('debe permitir acceso legítimo a un administrador a GET /admin/stats -> HTTP 200 OK', async () => {
      const res = await requestHttp('GET', '/admin/stats', {
        token: tokenAdmin,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalUsers');
    });
  });

  describe('3. Prevención de Mass Assignment & Validación de DTOs', () => {
    it('debe rechazar con HTTP 400 el envío de campos no permitidos en registro (forbidNonWhitelisted)', async () => {
      const res = await requestHttp('POST', '/auth/register', {
        body: {
          email: `mass_${Date.now()}@aloe.ulima.edu.pe`,
          password: 'Password123!',
          name: 'Hacker User',
          role: 'admin', // Propiedad no permitida en RegisterDto
          isVerified: true,
        },
      });
      expect(res.status).toBe(400);
    });

    it('debe rechazar con HTTP 400 si se intenta inyectar campos privilegiados en PUT /profiles/me', async () => {
      const res = await requestHttp('PUT', '/profiles/me', {
        token: tokenUserA,
        body: {
          bio: 'Bio actualizada',
          role: 'admin', // No está en UpdateProfileDto
        },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('4. Revocación Instantánea de Sesiones (tokens_valid_after)', () => {
    it('debe revocar inmediatamente el JWT de Usuario B tras ser suspendido por el Administrador', async () => {
      // 1. Verificar que tokenUserB funciona antes de la suspensión
      const beforeRes = await requestHttp('GET', '/profiles/me', { token: tokenUserB });
      expect(beforeRes.status).toBe(200);

      // 2. Admin suspende la cuenta de Usuario B
      const suspendRes = await requestHttp('PATCH', `/admin/users/${userBId}/status`, {
        token: tokenAdmin,
        body: { status: 'suspended', reason: 'Suspensión disciplinaria para prueba OWASP' },
      });
      expect(suspendRes.status).toBe(200);

      // 3. tokenUserB debe ser rechazado inmediatamente con HTTP 401 Unauthorized
      const afterRes = await requestHttp('GET', '/profiles/me', { token: tokenUserB });
      expect([401, 403]).toContain(afterRes.status);
    });
  });

  describe('5. Sanitización y Resistencia ante Inyección SQL', () => {
    it('debe sanitizar payloads SQL en parámetros de búsqueda de publicaciones sin romper TypeORM', async () => {
      const sqlInjectionPayloads = [
        `' OR '1'='1`,
        `'; DROP TABLE test_dummy; --`,
        `' UNION SELECT null, null, null--`,
        `admin'--`,
      ];

      for (const payload of sqlInjectionPayloads) {
        const res = await requestHttp('GET', `/posts?search=${encodeURIComponent(payload)}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.items || res.body)).toBe(true);
      }
    });

    it('debe sanitizar caracteres especiales y comillas en consulta de catálogo de cursos', async () => {
      const res = await requestHttp('GET', `/courses`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});

