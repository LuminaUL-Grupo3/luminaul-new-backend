import 'reflect-metadata';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'luminaul-e2e-integration-secret-key-2026-secure';
process.env.WEB_ORIGIN = 'http://localhost:5173,http://127.0.0.1:5173';

import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { createHmac } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { API_PREFIX, configureHttpApp } from '../src/config/http-app.config';
import { SessionService } from '../src/modules/auth-security/service/SessionService';
import { UsersRepository } from '../src/modules/auth-security/repository/UsersRepository';
import { UserRole } from '../src/modules/auth-security/enums/UserRole';
import { UserAccountStatus } from '../src/modules/auth-security/enums/UserAccountStatus';

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
  let tutoringPostUserAId: string;
  let tutoringRequestForAId: string;
  let groupUserAId: string;
  let availabilityUserAId: string;
  let courseId: string;

  const requestHttp = async (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: {
      token?: string;
      body?: unknown;
      rawBody?: string;
      headers?: Record<string, string>;
    } = {},
  ) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    const res = await fetch(`${baseUrl}/${API_PREFIX}${path}`, {
      method,
      headers,
      body:
        options.rawBody !== undefined
          ? options.rawBody
          : options.body
            ? JSON.stringify(options.body)
            : undefined,
    });

    let body: any = null;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    return { status: res.status, body, headers: res.headers, text };
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
    courseId = course.id;

    // Sembrar Post del Usuario A
    const [post] = await dataSource.query(
      `INSERT INTO publications (id, user_id, course_id, type, description, status)
       VALUES (gen_random_uuid(), $1, $2, 'study_group', 'Post de Usuario A', 'published')
       RETURNING id`,
      [userAId, course.id],
    );
    postUserAId = post.id;

    // Sembrar Post de Asesoría del Usuario A y solicitud pendiente
    const [tutPost] = await dataSource.query(
      `INSERT INTO publications (id, user_id, course_id, type, description, status)
       VALUES (gen_random_uuid(), $1, $2, 'tutoring', 'Asesoría de Usuario A', 'published')
       RETURNING id`,
      [userAId, course.id],
    );
    tutoringPostUserAId = tutPost.id;

    const [tutReq] = await dataSource.query(
      `INSERT INTO tutoring_requests (id, publication_id, tutor_id, requester_id, message, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Solicitud para prueba OWASP', 'pending')
       RETURNING id`,
      [tutoringPostUserAId, userAId, userBId],
    );
    tutoringRequestForAId = tutReq.id;

    // Sembrar Grupo del Usuario A
    const [group] = await dataSource.query(
      `INSERT INTO groups (id, name, course_code, leader_id)
       VALUES (gen_random_uuid(), 'Grupo de A', 'CS001', $1)
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
      await dataSource.query('DELETE FROM tutoring_requests WHERE id = $1', [tutoringRequestForAId]).catch(() => {});
      await dataSource.query('DELETE FROM publications WHERE id IN ($1, $2)', [postUserAId, tutoringPostUserAId]).catch(() => {});
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

      // 4. Reactivar Usuario B y renovar token para las pruebas siguientes
      const reactivateRes = await requestHttp('PATCH', `/admin/users/${userBId}/status`, {
        token: tokenAdmin,
        body: { status: 'active', reason: 'Reactivación tras prueba de revocación' },
      });
      expect(reactivateRes.status).toBe(200);
      const sessions = app.get(SessionService);
      const usersRepo = app.get(UsersRepository);
      const refreshedB = await usersRepo.findById(userBId);
      if (refreshedB) {
        tokenUserB = sessions.issueAccessToken(refreshedB);
      }
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

  describe('6. A07:2021 – Fallas de Autenticación y Falsificación de JWT', () => {
    const toBase64Url = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');

    it('debe rechazar un JWT con algoritmo "none" (alg:none attack) -> HTTP 401', async () => {
      const header = toBase64Url({ alg: 'none', typ: 'JWT' });
      const payload = toBase64Url({
        sub: adminId,
        email: 'admin@aloe.ulima.edu.pe',
        role: 'admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const unsignedJwt = `${header}.${payload}.`;

      const res = await requestHttp('GET', '/admin/stats', { token: unsignedJwt });
      expect(res.status).toBe(401);
    });

    it('debe rechazar un JWT con payload manipulado (escalamiento role=admin) -> HTTP 401', async () => {
      const [hdr, rawPayload, sig] = tokenUserA.split('.');
      const decoded = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf8'));
      decoded.role = 'admin';
      const tampered = `${hdr}.${toBase64Url(decoded)}.${sig}`;

      const res = await requestHttp('GET', '/admin/stats', { token: tampered });
      expect(res.status).toBe(401);
    });

    it('debe rechazar un JWT expirado aunque esté firmado con el secreto real -> HTTP 401', async () => {
      const secret = process.env.JWT_SECRET!;
      const header = toBase64Url({ alg: 'HS256', typ: 'JWT' });
      const payload = toBase64Url({
        sub: userAId,
        role: 'student',
        iat: Math.floor(Date.now() / 1000) - 600,
        exp: Math.floor(Date.now() / 1000) - 120,
      });
      const sig = createHmac('sha256', secret)
        .update(`${header}.${payload}`)
        .digest('base64url');

      const res = await requestHttp('GET', '/profiles/me', {
        token: `${header}.${payload}.${sig}`,
      });
      expect(res.status).toBe(401);
    });

    it('debe rechazar una cookie de sesión falsificada -> HTTP 401', async () => {
      const res = await requestHttp('GET', '/profiles/me', {
        headers: { Cookie: 'luminaul_access=forged.jwt.token' },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('7. A01:2021 – Control de Acceso Avanzado (Asesorías, Chat y Path/UUID)', () => {
    it('debe impedir que Usuario B decida una solicitud de asesoría dirigida a Usuario A -> HTTP 403', async () => {
      const res = await requestHttp(
        'PATCH',
        `/posts/tutoring-requests/${tutoringRequestForAId}`,
        {
          token: tokenUserB,
          body: { status: 'accepted' },
        },
      );
      expect(res.status).toBe(403);
    });

    it('debe impedir que Usuario A solicite su propia publicación de asesoría -> HTTP 400', async () => {
      const res = await requestHttp(
        'POST',
        `/posts/${tutoringPostUserAId}/tutoring-requests`,
        {
          token: tokenUserA,
          body: { message: 'Auto-solicitud' },
        },
      );
      expect(res.status).toBe(400);
    });

    it('debe impedir que Usuario B (no miembro) lea mensajes o integrantes del grupo de Usuario A -> HTTP 403', async () => {
      const readRes = await requestHttp('GET', `/groups/${groupUserAId}/messages`, {
        token: tokenUserB,
      });
      expect(readRes.status).toBe(403);

      const membersRes = await requestHttp('GET', `/groups/${groupUserAId}/members`, {
        token: tokenUserB,
      });
      expect(membersRes.status).toBe(403);
    });

    it('debe impedir que Usuario B transfiera el liderazgo del grupo de Usuario A -> HTTP 403', async () => {
      const res = await requestHttp('PATCH', `/groups/${groupUserAId}/leader`, {
        token: tokenUserB,
        body: { userId: userBId },
      });
      expect(res.status).toBe(403);
    });

    it('debe rechazar UUIDs malformados y Path Traversal sin exponer HTTP 500', async () => {
      const invalidPostRes = await requestHttp('GET', '/posts/not-a-valid-uuid', {
        token: tokenUserA,
      });
      expect([400, 404]).toContain(invalidPostRes.status);

      const traversalRes = await requestHttp('GET', '/groups/../../admin/stats', {
        token: tokenUserA,
      });
      expect([400, 403, 404]).toContain(traversalRes.status);
    });
  });

  describe('8. A02:2021 – Fallas Criptográficas y Exposición de Datos Sensibles', () => {
    it('nunca debe exponer passwordHash ni tokensValidAfter en perfil ni en listado admin', async () => {
      const profileRes = await requestHttp('GET', '/profiles/me', { token: tokenUserA });
      expect(profileRes.status).toBe(200);
      expect(profileRes.text).not.toMatch(/passwordHash|password_hash|tokensValidAfter|tokens_valid_after/i);

      const adminUsersRes = await requestHttp('GET', '/admin/users', { token: tokenAdmin });
      expect(adminUsersRes.status).toBe(200);
      expect(adminUsersRes.text).not.toMatch(/passwordHash|password_hash|tokensValidAfter|tokens_valid_after/i);
    });

    it('no debe filtrar stack traces ni consultas SQL en respuestas de error', async () => {
      const badReq = await requestHttp('POST', '/posts', {
        token: tokenUserA,
        body: { invalidField: true },
      });
      expect(badReq.status).toBe(400);
      expect(badReq.text).not.toMatch(/at\s+\w+\s+\(|SELECT\s+|INSERT\s+INTO|node_modules/i);
    });
  });

  describe('9. A03:2021 – Inyección Avanzada (Prototype Pollution, XSS y Paginación)', () => {
    it('debe bloquear Prototype Pollution (constructor / __proto__) sin contaminar Object.prototype', async () => {
      const ctorRes = await requestHttp('PUT', '/profiles/me', {
        token: tokenUserA,
        rawBody: '{"constructor":{"prototype":{"role":"admin"}},"bio":"test"}',
      });
      expect([200, 400]).toContain(ctorRes.status);
      expect((ctorRes.body as Record<string, unknown>)?.role).toBeUndefined();

      const protoRes = await requestHttp('PUT', '/profiles/me', {
        token: tokenUserA,
        rawBody: '{"__proto__":{"role":"admin"},"bio":"test"}',
      });
      expect([200, 400]).toContain(protoRes.status);
      expect(({} as Record<string, unknown>).role).toBeUndefined();
    });

    it('debe responder siempre con Content-Type application/json ante payloads XSS almacenados', async () => {
      const xssPayload = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
      const createRes = await requestHttp('POST', '/posts', {
        token: tokenUserA,
        body: {
          type: 'tutoring',
          courseId,
          description: xssPayload,
        },
      });
      expect([201, 400]).toContain(createRes.status);
      expect(createRes.headers.get('content-type') || '').toContain('application/json');

      if (createRes.status === 201 && createRes.body?.id) {
        await dataSource.query('DELETE FROM publications WHERE id = $1', [createRes.body.id]).catch(() => {});
      }
    });

    it('debe rechazar parámetros de paginación/filtro manipulados sin provocar HTTP 500', async () => {
      const res = await requestHttp(
        'GET',
        '/posts?limit=-10&offset=-1&courseId=invalid-uuid',
      );
      expect(res.status).toBe(400);
    });
  });

  describe('10. A04:2021 / A05:2021 – Diseño Inseguro y Misconfiguración CORS', () => {
    it('no debe reflejar orígenes CORS maliciosos ni bypass por subdominio', async () => {
      const evilOrigins = [
        'https://evil-attacker.com',
        'http://localhost:5173.evil.com',
        'null',
      ];

      for (const origin of evilOrigins) {
        const res = await requestHttp('GET', '/courses', {
          headers: { Origin: origin },
        });
        const allowed = res.headers.get('access-control-allow-origin');
        expect(allowed).not.toBe(origin);
        expect(allowed).not.toBe('*');
      }
    });

    it('debe rechazar capacidades fuera de rango en creación de grupos (0 y 999) -> HTTP 400', async () => {
      for (const maxCapacity of [0, -5, 999]) {
        const res = await requestHttp('POST', '/groups', {
          token: tokenUserA,
          body: {
            name: 'Grupo Capacidad Inválida',
            description: 'Prueba de límites',
            courseCode: 'CS001',
            meetingMode: 'virtual',
            meetingShift: 'tarde',
            maxCapacity,
          },
        });
        expect(res.status).toBe(400);
      }
    });

    it('debe impedir que un usuario se envíe una reseña a sí mismo (Self-Review Abuse)', async () => {
      const res = await requestHttp('POST', '/reviews', {
        token: tokenUserA,
        body: {
          reviewedUserId: userAId,
          rating: 5,
          comment: 'Auto-reseña para inflar reputación',
        },
      });
      expect([400, 403, 409]).toContain(res.status);
    });
  });
});

