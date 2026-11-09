import 'reflect-metadata';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'luminaul-e2e-integration-secret-key-2026-secure';
process.env.WEB_ORIGIN = 'http://localhost:5173,http://127.0.0.1:5173';

import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { hash } from 'bcryptjs';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { API_PREFIX, configureHttpApp } from '../src/config/http-app.config';

describe('E2E Integration Flow: LuminaUL Monolito Modular (7 Módulos)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;

  const ts = Date.now();
  const userAEmail = `jest_leader_${ts}@aloe.ulima.edu.pe`;
  const userBEmail = `jest_applicant_${ts}@aloe.ulima.edu.pe`;
  const adminEmail = 'admin@aloe.ulima.edu.pe';
  const defaultPassword = 'PasswordSegura2026!';

  let userAId: string;
  let userBId: string;
  let adminId: string;

  let tokenA: string;
  let tokenB: string;
  let adminToken: string;

  let courseId: string;
  let postId: string;
  let groupId: string;
  let requestId: string;
  let flaggedPostId: string;
  let appealId: string;
  let reportId: string;

  let socketA: Socket;
  let socketB: Socket;

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
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  };

  const emitWithAck = (socket: Socket, event: string, payload: unknown): Promise<any> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout esperando ACK de "${event}"`)), 5000);
      socket.emit(event, payload, (ack: any) => {
        clearTimeout(timer);
        resolve(ack);
      });
    });
  };

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttpApp(app);


    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'string' ? 3000 : address.port;
    baseUrl = `http://127.0.0.1:${port}`;

    dataSource = app.get(DataSource);

    // Asegurar palabras prohibidas
    await dataSource.query(`
      INSERT INTO banned_words (id, word, severity)
      VALUES (gen_random_uuid(), 'estafa', 'high'), (gen_random_uuid(), 'spam', 'high')
      ON CONFLICT (word) DO NOTHING;
    `);

    // Asegurar semilla de Administrador activa y verificada (SPEC-01 / SPEC-07)
    const adminPasswordHash = await hash(defaultPassword, 10);
    await dataSource.query(
      `
      INSERT INTO users (id, email, password_hash, name, role, status, is_verified, tokens_valid_after, created_at, updated_at)
      VALUES ('99887766-5544-4322-8100-aabbccddeeff', $1, $2, 'Administrador General', 'admin', 'active', true, NOW() - INTERVAL '60 seconds', NOW(), NOW())
      ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role = 'admin',
          status = 'active',
          is_verified = true,
          tokens_valid_after = NOW() - INTERVAL '60 seconds',
          updated_at = NOW();
      `,
      [adminEmail, adminPasswordHash],
    );
    await dataSource.query(
      `
      INSERT INTO profiles (user_id, name, bio, major, academic_cycle, updated_at)
      SELECT id, 'Administrador General', 'Gestión de Comunidad LuminaUL', 'Administración', '10', NOW()
      FROM users WHERE email = $1
      ON CONFLICT (user_id) DO NOTHING;
      `,
      [adminEmail],
    );
  }, 30000);

  afterAll(async () => {
    if (socketA?.connected) socketA.disconnect();
    if (socketB?.connected) socketB.disconnect();

    if (dataSource?.isInitialized) {
      if (flaggedPostId) await dataSource.query('DELETE FROM publications WHERE id = $1', [flaggedPostId]).catch(() => {});
      if (postId) await dataSource.query('DELETE FROM publications WHERE id = $1', [postId]).catch(() => {});
      if (groupId) await dataSource.query('DELETE FROM groups WHERE id = $1', [groupId]).catch(() => {});
      await dataSource.query('DELETE FROM users WHERE email IN ($1, $2)', [userAEmail, userBEmail]).catch(() => {});
    }

    await app.close();
  });

  describe('FASE 1: Autenticación, Seguridad y RBAC (auth-security)', () => {
    it('debe registrar Usuario A (Líder) con HTTP 201', async () => {
      const res = await apiRequest('POST', '/auth/register', {
        body: { email: userAEmail, password: defaultPassword, name: 'Líder Usuario A' },
      });
      expect(res.status).toBe(201);
      expect(res.body.userId).toBeDefined();
      userAId = res.body.userId;
    });

    it('debe registrar Usuario B (Postulante) con HTTP 201', async () => {
      const res = await apiRequest('POST', '/auth/register', {
        body: { email: userBEmail, password: defaultPassword, name: 'Postulante Usuario B' },
      });
      expect(res.status).toBe(201);
      expect(res.body.userId).toBeDefined();
      userBId = res.body.userId;
    });

    it('debe rechazar con HTTP 400 el registro con correo no institucional (@gmail.com)', async () => {
      const res = await apiRequest('POST', '/auth/register', {
        body: { email: 'externo@gmail.com', password: defaultPassword, name: 'Usuario Gmail' },
      });
      expect(res.status).toBe(400);
    });

    it('debe autenticar con éxito a Usuario A, Usuario B y Administrador', async () => {
      // Activar cuentas para el login
      await dataSource.query(
        `UPDATE users SET status = 'active', is_verified = true, tokens_valid_after = NOW() - INTERVAL '5 seconds' WHERE email IN ($1, $2)`,
        [userAEmail, userBEmail],
      );

      // Login Usuario A
      const resA = await apiRequest('POST', '/auth/login', {
        body: { email: userAEmail, password: defaultPassword },
      });
      expect(resA.status).toBe(200);
      tokenA = resA.body.accessToken;

      // Login Usuario B
      const resB = await apiRequest('POST', '/auth/login', {
        body: { email: userBEmail, password: defaultPassword },
      });
      expect(resB.status).toBe(200);
      tokenB = resB.body.accessToken;

      // Login Admin
      const resAdmin = await apiRequest('POST', '/auth/login', {
        body: { email: adminEmail, password: defaultPassword },
      });
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.user.role).toBe('admin');
      adminToken = resAdmin.body.accessToken;
      adminId = resAdmin.body.user.id;
    });
  });

  describe('FASE 2: Perfiles y Matriz de Disponibilidad (user-profile)', () => {
    it('Usuario A actualiza carrera, ciclo="6" y biografía con HTTP 200', async () => {
      const res = await apiRequest('PUT', '/profiles/me', {
        token: tokenA,
        body: { major: 'Ingeniería de Sistemas', academicCycle: '6', bio: 'Líder de grupos de estudio' },
      });
      expect(res.status).toBe(200);
      expect(res.body.academicCycle).toBe('6');
      expect(res.body.major).toBe('Ingeniería de Sistemas');
    });

    it('Usuario A registra franja horaria Lunes 14:00-16:00 con HTTP 201', async () => {
      const res = await apiRequest('POST', '/profiles/me/availability', {
        token: tokenA,
        body: { dayOfWeek: 'lunes', startTime: '14:00', endTime: '16:00' },
      });
      expect(res.status).toBe(201);
      expect(res.body.availability.startTime).toBe('14:00');
    });

    it('debe rechazar regla de inversión horaria (16:00 -> 14:00) con HTTP 400', async () => {
      const res = await apiRequest('POST', '/profiles/me/availability', {
        token: tokenA,
        body: { dayOfWeek: 'lunes', startTime: '16:00', endTime: '14:00' },
      });
      expect(res.status).toBe(400);
    });

    it('debe rechazar regla de solapamiento horario (15:00 -> 17:00) con HTTP 400', async () => {
      const res = await apiRequest('POST', '/profiles/me/availability', {
        token: tokenA,
        body: { dayOfWeek: 'lunes', startTime: '15:00', endTime: '17:00' },
      });
      expect(res.status).toBe(400);
    });

    it('Usuario B consulta el perfil de Usuario A y verifica bio y horarios', async () => {
      const res = await apiRequest('GET', `/profiles/${userAId}`, { token: tokenB });
      expect(res.status).toBe(200);
      expect(res.body.bio).toBe('Líder de grupos de estudio');
      expect(res.body.availabilities.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('FASE 3: Publicaciones y Convocatorias (courses & posts)', () => {
    it('Usuario A consulta catálogo de cursos y toma uno válido de ciclo 6', async () => {
      const res = await apiRequest('GET', '/courses', { token: tokenA });
      expect(res.status).toBe(200);
      const course = res.body.find((c: any) => c.cycle === 6 || c.cycle === 7);
      expect(course).toBeDefined();
      courseId = course.id;
    });

    it('Usuario A crea publicación de convocatoria (study_group) con HTTP 201', async () => {
      const res = await apiRequest('POST', '/posts', {
        token: tokenA,
        body: {
          courseId,
          type: 'study_group',
          description: 'Convocatoria para grupo de estudio en biblioteca',
          benefits: 'Exámenes pasados y resolución de dudas',
          requirements: 'Puntualidad y compromiso',
          maxCapacity: 5,
        },
      });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      postId = res.body.id;
    });

    it('Usuario B consulta el feed de publicaciones filtrado por curso y tipo', async () => {
      const res = await apiRequest('GET', `/posts?type=study_group&courseId=${courseId}`, { token: tokenB });
      expect(res.status).toBe(200);
      const found = res.body.items?.some((p: any) => p.id === postId) || res.body.some?.((p: any) => p.id === postId);
      expect(found).toBe(true);
    });
  });

  describe('FASE 4: Grupos, Solicitudes y Mensajería WebSocket (group-messaging)', () => {
    it('Usuario A crea grupo de estudio y figura como leader en group_members', async () => {
      const res = await apiRequest('POST', '/groups', {
        token: tokenA,
        body: {
          name: `Grupo E2E ${ts}`,
          description: 'Grupo creado durante suite E2E',
          courseCode: 'CS001',
          meetingMode: 'virtual',
          meetingShift: 'manana',
          maxCapacity: 5,
        },
      });
      expect(res.status).toBe(201);
      groupId = res.body.id;

      const membersRes = await apiRequest('GET', `/groups/${groupId}/members`, { token: tokenA });
      expect(membersRes.status).toBe(200);
      const leaderMember = membersRes.body.find((m: any) => m.userId === userAId);
      expect(leaderMember?.role).toBe('leader');
    });

    it('Usuario B postula al grupo con HTTP 201', async () => {
      const res = await apiRequest('POST', `/groups/${groupId}/join-requests`, {
        token: tokenB,
        body: { message: 'Hola, me gustaría ingresar al grupo' },
      });
      expect(res.status).toBe(201);
      requestId = res.body.id;
    });

    it('debe rechazar solicitud duplicada de Usuario B con HTTP 409 Conflict', async () => {
      const res = await apiRequest('POST', `/groups/${groupId}/join-requests`, {
        token: tokenB,
        body: { message: 'Intento repetido' },
      });
      expect(res.status).toBe(409);
    });

    it('Usuario A aprueba solicitud y Usuario B pasa a ser miembro activo', async () => {
      const approveRes = await apiRequest('PATCH', `/groups/${groupId}/join-requests/${requestId}`, {
        token: tokenA,
        body: { status: 'approved' },
      });
      expect(approveRes.status).toBe(200);

      const membersRes = await apiRequest('GET', `/groups/${groupId}/members`, { token: tokenA });
      const memberB = membersRes.body.find((m: any) => m.userId === userBId);
      expect(memberB).toBeDefined();
      expect(memberB.role).toBe('member');
    });

    it('WebSockets: conexión de sockets, ACK de envío, recepción en tiempo real y persistencia relacional', async () => {
      socketA = io(baseUrl, { auth: { token: tokenA }, transports: ['websocket'], reconnection: false });
      socketB = io(baseUrl, { auth: { token: tokenB }, transports: ['websocket'], reconnection: false });

      await new Promise((r) => setTimeout(r, 600));

      // Ambos sockets se unen a la sala
      const joinAckA = await emitWithAck(socketA, 'chat:join_room', { groupId });
      expect(joinAckA.success).toBe(true);

      const joinAckB = await emitWithAck(socketB, 'chat:join_room', { groupId });
      expect(joinAckB.success).toBe(true);

      const chatMessage = 'Hola equipo, listos para estudiar en E2E';
      const msgReceivePromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout en recepción de chat:new_message')), 5000);
        socketA.once('chat:new_message', (msg) => {
          clearTimeout(timeout);
          resolve(msg);
        });
      });

      // B envía mensaje
      const sendAck = await emitWithAck(socketB, 'chat:send_message', { groupId, content: chatMessage });
      expect(sendAck.success).toBe(true);
      const messageId = sendAck.message.id;

      // A recibe en tiempo real
      const received = await msgReceivePromise;
      expect(received.content).toBe(chatMessage);
      expect(received.sender.id).toBe(userBId);

      // Persistencia relacional verificada
      const messagesRes = await apiRequest('GET', `/groups/${groupId}/messages`, { token: tokenA });
      expect(messagesRes.status).toBe(200);
      const persisted = messagesRes.body.items?.some((m: any) => m.id === messageId) || messagesRes.body.some?.((m: any) => m.id === messageId);
      expect(persisted).toBe(true);
    });
  });

  describe('FASE 5: Sistema de Reseñas y Calificaciones (reviews)', () => {
    it('Usuario B consulta elegibilidad sobre Usuario A -> allowed=true por compartir grupo', async () => {
      const res = await apiRequest('GET', `/reviews/eligibility/${userAId}`, { token: tokenB });
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(true);
    });

    it('Usuario B califica a Usuario A con rating=5 con HTTP 201', async () => {
      const res = await apiRequest('POST', '/reviews', {
        token: tokenB,
        body: { reviewedUserId: userAId, rating: 5, comment: 'Excelente compañero en el grupo' },
      });
      expect(res.status).toBe(201);
      expect(res.body.rating).toBe(5);
    });

    it('debe rechazar intento de auto-calificación de Usuario B con HTTP 400', async () => {
      const res = await apiRequest('POST', '/reviews', {
        token: tokenB,
        body: { reviewedUserId: userBId, rating: 5, comment: 'Auto reseña' },
      });
      expect(res.status).toBe(400);
    });

    it('debe rechazar segunda reseña duplicada de Usuario B sobre Usuario A con HTTP 409', async () => {
      const res = await apiRequest('POST', '/reviews', {
        token: tokenB,
        body: { reviewedUserId: userAId, rating: 4, comment: 'Segunda reseña duplicada' },
      });
      expect(res.status).toBe(409);
    });
  });

  describe('FASE 6: Moderación de Contenido y Eventos Asíncronos (moderation)', () => {
    it('debe ocultar automáticamente publicación con lenguaje restringido ("estafa") vía content.created', async () => {
      const badPostRes = await apiRequest('POST', '/posts', {
        token: tokenB,
        body: {
          courseId,
          type: 'study_group',
          description: 'Esta es una estafa explícita con lenguaje prohibido',
          maxCapacity: 5,
        },
      });
      expect(badPostRes.status).toBe(201);
      flaggedPostId = badPostRes.body.id;

      // Esperar resolución asíncrona del listener
      await new Promise((r) => setTimeout(r, 800));

      const [postRow] = await dataSource.query('SELECT status FROM publications WHERE id = $1', [flaggedPostId]);
      expect(postRow.status).toBe('hidden');
    });

    it('Usuario B reporta la publicación de Usuario A con HTTP 201', async () => {
      const res = await apiRequest('POST', '/moderation/reports', {
        token: tokenB,
        body: { targetType: 'publication', targetId: postId, reason: 'Contenido sospechoso de prueba E2E' },
      });
      expect(res.status).toBe(201);
      reportId = res.body.reportId ?? res.body.report?.id;
      expect(reportId).toBeDefined();
    });

    it('debe rechazar reporte duplicado del mismo autor sobre el mismo recurso con HTTP 409', async () => {
      const res = await apiRequest('POST', '/moderation/reports', {
        token: tokenB,
        body: { targetType: 'publication', targetId: postId, reason: 'Reporte repetido' },
      });
      expect(res.status).toBe(409);
    });

    it('Usuario B consulta my-logs y envía apelación con HTTP 201', async () => {
      const myLogsRes = await apiRequest('GET', '/moderation/my-logs', { token: tokenB });
      expect(myLogsRes.status).toBe(200);
      const modLog = myLogsRes.body.find((l: any) => l.contentId === flaggedPostId);
      expect(modLog).toBeDefined();

      const appealRes = await apiRequest('POST', '/moderation/appeals', {
        token: tokenB,
        body: { moderationLogId: modLog.id, justification: 'Uso meramente educativo en ciberseguridad' },
      });
      expect(appealRes.status).toBe(201);
      appealId = appealRes.body.appealId ?? appealRes.body.appeal?.id;
      expect(appealId).toBeDefined();
    });
  });

  describe('FASE 7: Panel de Administración y Revocación de Sesiones (administration)', () => {
    it('debe rechazar acceso de estudiante a /admin/stats con HTTP 403 y permitirlo para Admin con HTTP 200', async () => {
      const studentRes = await apiRequest('GET', '/admin/stats', { token: tokenA });
      expect(studentRes.status).toBe(403);

      const adminRes = await apiRequest('GET', '/admin/stats', { token: adminToken });
      expect(adminRes.status).toBe(200);
      expect(typeof adminRes.body.totalUsers).toBe('number');
    });

    it('Administrador aprueba apelación y restaura la publicación oculta a status="published"', async () => {
      const resolveRes = await apiRequest('PATCH', `/admin/appeals/${appealId}`, {
        token: adminToken,
        body: { status: 'approved' },
      });
      expect(resolveRes.status).toBe(200);

      const [postRow] = await dataSource.query('SELECT status FROM publications WHERE id = $1', [flaggedPostId]);
      expect(postRow.status).toBe('published');
    });

    it('Administrador suspende la cuenta de Usuario B con HTTP 200', async () => {
      const suspendRes = await apiRequest('PATCH', `/admin/users/${userBId}/status`, {
        token: adminToken,
        body: { status: 'suspended', reason: 'Falta disciplinaria comprobada en suite E2E' },
      });
      expect(suspendRes.status).toBe(200);
    });

    it('Aserción Crítica de Seguridad: token activo de Usuario B queda inmediatamente revocado (HTTP 401/403)', async () => {
      const res = await apiRequest('GET', '/profiles/me', { token: tokenB });
      expect([401, 403]).toContain(res.status);
    });

    it('Aserción Crítica de Seguridad: intento de login de cuenta suspendida es bloqueado con HTTP 403', async () => {
      const res = await apiRequest('POST', '/auth/login', {
        body: { email: userBEmail, password: defaultPassword },
      });
      expect(res.status).toBe(403);
    });
  });
});
