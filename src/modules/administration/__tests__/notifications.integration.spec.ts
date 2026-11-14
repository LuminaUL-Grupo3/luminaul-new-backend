import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { hash } from 'bcryptjs';
import { io, Socket } from 'socket.io-client';
import { configureHttpApp } from '../../../config/http-app.config';
import { NotificationType } from '../enums/administration.enums';
import { NotificationsService } from '../service/NotificationsService';
import type { DeliveredNotification } from '../../../common/events/notification-delivery.event';

const databaseUrl = process.env.TEST_NOTIFICATIONS_DATABASE_URL;
/** HTTP y sockets reales; ninguna cuenta del equipo se suspende durante estas pruebas. */
describe.skipIf(!databaseUrl)('Notificaciones privadas en tiempo real', () => {
  let app: INestApplication, db: DataSource, base: string, origin: string;
  const users = Array.from({ length: 4 }, () => randomUUID()),
    tokens: string[] = [],
    sockets: Socket[] = [],
    noticeIds = new Set<string>();
  const password = 'Notificaciones!2026';
  let groupId: string, requestId: string, messageId: string, reportId: string;
  let leader: Socket, member: Socket, outsider: Socket, admin: Socket;
  const bannedWordId = randomUUID();
  let moderatedMessageId: string, moderationLogId: string;
  const received: DeliveredNotification[][] = [[], [], [], []];

  async function api(path: string, actor: number, method = 'GET', body?: object) {
    const response = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${tokens[actor]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  }
  function event<T>(socket: Socket, name: string, matches: (value: T) => boolean = () => true): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(name, handler);
        reject(Error(`No llegó ${name}`));
      }, 5000);
      function handler(value: T) {
        if (!matches(value)) return;
        clearTimeout(timer);
        socket.off(name, handler);
        resolve(value);
      }
      socket.on(name, handler);
    });
  }
  async function connect(actor: number) {
    const socket = io(origin, {
      auth: { token: tokens[actor] },
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
    });
    sockets.push(socket);
    socket.on('notification:new', (n: DeliveredNotification) => received[actor].push(n));
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('No abrió la sala privada')), 5000);
      socket.once('notifications:ready', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('connect_error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
    socket.connect();
    await ready;
    return socket;
  }
  beforeAll(async () => {
    const target = new URL(databaseUrl!);
    if (
      !['localhost', '127.0.0.1'].includes(target.hostname) ||
      !/^\/luminaul_spec04_hu22_test(?:_\d+)?$/.test(target.pathname)
    )
      throw Error('Se requiere una base local exclusiva de pruebas.');
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: 'false',
      MAIL_TRANSPORT: 'console',
      JWT_SECRET: randomBytes(48).toString('hex'),
    });
    delete process.env.OPENAI_API_KEY;
    const { AppModule } = await import('../../../app.module');
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttpApp(app);
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
    base = origin + '/api';
    db = app.get(DataSource);
    app
      .get(EventEmitter2)
      .on('notification.created', ({ notification }: { notification: DeliveredNotification }) =>
        noticeIds.add(notification.id),
      );
    const passwordHash = await hash(password, 10);
    for (let i = 0; i < users.length; i++) {
      const email = `rt.${users[i]}@aloe.ulima.edu.pe`;
      await db.query(
        "INSERT INTO users(id,email,name,password_hash,role,status,is_verified,tokens_valid_after) VALUES($1,$2,$3,$4,$5,'active',true,NOW()-INTERVAL '1 minute')",
        [users[i], email, `Prueba de avisos ${i}`, passwordHash, i === 3 ? 'admin' : 'student'],
      );
      await db.query('INSERT INTO profiles(user_id,name) VALUES($1,$2)', [users[i], `Prueba de avisos ${i}`]);
      const response = await api('/auth/login', i, 'POST', { email, password });
      expect(response.status).toBe(200);
      tokens.push(response.body.accessToken);
    }
    [leader, member, outsider, admin] = await Promise.all(users.map((_, i) => connect(i)));
    const group = await api('/groups', 0, 'POST', {
      name: 'Prueba de notificaciones',
      courseCode: 'ISW2',
      meetingMode: 'virtual',
      meetingShift: 'tarde',
      maxCapacity: 3,
    });
    expect(group.status).toBe(201);
    groupId = group.body.id;
  }, 60000);
  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    if (db?.isInitialized) {
      await db.query('DELETE FROM audit_logs WHERE admin_id=ANY($1::uuid[])', [users]);
      await db.query('DELETE FROM reports WHERE reporter_id=ANY($1::uuid[])', [users]);
      await db.query('DELETE FROM appeals WHERE user_id=ANY($1::uuid[])', [users]);
      await db.query('DELETE FROM moderation_logs WHERE author_id=ANY($1::uuid[])', [users]);
      if (groupId)
        await db.query(
          "DELETE FROM moderation_tasks WHERE content_type='message' AND content_id IN (SELECT id FROM group_messages WHERE group_id=$1)",
          [groupId],
        );
      if (groupId) await db.query('DELETE FROM groups WHERE id=$1 AND leader_id=$2', [groupId, users[0]]);
      if (noticeIds.size) await db.query('DELETE FROM notifications WHERE id=ANY($1::uuid[])', [[...noticeIds]]);
      await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]);
      await db.query('DELETE FROM banned_words WHERE id=$1', [bannedWordId]);
    }
    if (app) await app.close();
  });

  it('rechaza una conexión sin sesión', async () => {
    const socket = io(origin, { autoConnect: false, reconnection: false, transports: ['websocket'] });
    sockets.push(socket);
    const denied = event<Error>(socket, 'connect_error');
    socket.connect();
    expect((await denied).message).toContain('sesión');
  });
  it('envía la solicitud solo al líder y conserva el aviso antes de emitir', async () => {
    const delivery = event<DeliveredNotification>(
      leader,
      'notification:new',
      (n) => n.title === 'Nueva solicitud de ingreso',
    );
    const result = await api(`/groups/${groupId}/join-requests`, 1, 'POST', { message: 'Quiero participar.' });
    expect(result.status).toBe(201);
    requestId = result.body.id;
    const n = await delivery;
    expect(n.userId).toBe(users[0]);
    expect((await db.query('SELECT id FROM notifications WHERE id=$1', [n.id])).length).toBe(1);
    expect(received[1]).toHaveLength(0);
    expect(received[2]).toHaveLength(0);
    expect(received[3]).toHaveLength(0);
  });
  it('notifica la aceptación al solicitante por su sala privada', async () => {
    const delivery = event<DeliveredNotification>(member, 'notification:new', (n) => n.title === 'Solicitud aceptada');
    expect(
      (await api(`/groups/${groupId}/join-requests/${requestId}`, 0, 'PATCH', { status: 'approved' })).status,
    ).toBe(200);
    expect((await delivery).userId).toBe(users[1]);
    expect(received[2]).toHaveLength(0);
  });
  it('sincroniza la lectura en las dos conexiones propias y no en una ajena', async () => {
    const mirror = await connect(0),
      n = received[0][0];
    const first = event<{ id: string }>(leader, 'notification:read'),
      second = event<{ id: string }>(mirror, 'notification:read');
    expect((await api(`/notifications/${n.id}/read`, 0, 'PATCH')).status).toBe(200);
    expect((await first).id).toBe(n.id);
    expect((await second).id).toBe(n.id);
    expect((await api(`/notifications/${n.id}/read`, 2, 'PATCH')).status).toBe(404);
  });
  it('avisa del reporte al denunciante y a administración, preservando la privacidad del autor', async () => {
    const message = await leader.timeout(5000).emitWithAck('chat:join_room', { groupId });
    expect(message.success).toBe(true);
    const sent = await leader
      .timeout(5000)
      .emitWithAck('chat:send_message', {
        groupId,
        content: 'Ejercicio de prueba para reportar.',
        clientMessageId: randomUUID(),
      });
    expect(sent.success).toBe(true);
    messageId = sent.message.id;
    const receipt = event<DeliveredNotification>(member, 'notification:new', (n) => n.title === 'Reporte recibido');
    const pending = event<DeliveredNotification>(
      admin,
      'notification:new',
      (n) => n.title === 'Nuevo reporte pendiente',
    );
    const before = received[0].length;
    const result = await api('/moderation/reports', 1, 'POST', {
      targetType: 'message',
      targetId: messageId,
      reason: 'Revisión de prueba',
    });
    expect(result.status).toBe(201);
    reportId = result.body.reportId;
    expect((await receipt).userId).toBe(users[1]);
    expect((await pending).userId).toBe(users[3]);
    expect(received[0]).toHaveLength(before);
    expect(received[2]).toHaveLength(0);
  });
  it('comunica la resolución al denunciante y el retiro al autor del contenido', async () => {
    const author = event<DeliveredNotification>(leader, 'notification:new', (n) => n.title === 'Contenido eliminado');
    const reporter = event<DeliveredNotification>(member, 'notification:new', (n) => n.title === 'Reporte revisado');
    const result = await api(`/admin/reports/${reportId}`, 3, 'PATCH', {
      status: 'resolved',
      action: 'delete_content',
      notes: 'Caso de prueba',
    });
    expect(result.status).toBe(200);
    expect((await author).userId).toBe(users[0]);
    expect((await reporter).userId).toBe(users[1]);
  });
  it('notifica la moderación automática real sin consultar una API externa', async () => {
    const word = 'terminoprueba' + randomUUID().replace(/[0-9-]/g, '');
    await db.query('INSERT INTO banned_words(id,word) VALUES($1,$2)', [bannedWordId, word]);
    app.get(EventEmitter2).emit('banned_words.updated');
    const delivery = event<DeliveredNotification>(
      leader,
      'notification:new',
      (n) => n.type === 'MODERATION' && n.message.includes(word),
    );
    const sent = await leader
      .timeout(5000)
      .emitWithAck('chat:send_message', { groupId, content: word, clientMessageId: randomUUID() });
    expect(sent.success).toBe(true);
    moderatedMessageId = sent.message.id;
    expect((await delivery).userId).toBe(users[0]);
    const logs = await db.query('SELECT id FROM moderation_logs WHERE content_id=$1 AND author_id=$2', [
      moderatedMessageId,
      users[0],
    ]);
    expect(logs).toHaveLength(1);
    moderationLogId = logs[0].id;
    expect((await db.query('SELECT status FROM group_messages WHERE id=$1', [moderatedMessageId]))[0].status).toBe(
      'hidden',
    );
  });
  it('avisa de la apelación al administrador y del veredicto al alumno', async () => {
    const pending = event<DeliveredNotification>(
      admin,
      'notification:new',
      (n) => n.title === 'Nueva apelación pendiente',
    );
    const submitted = await api('/moderation/appeals', 0, 'POST', {
      moderationLogId,
      justification: 'Revisión del caso de prueba.',
    });
    expect(submitted.status).toBe(201);
    await pending;
    const result = event<DeliveredNotification>(leader, 'notification:new', (n) =>
      n.title.toLowerCase().includes('aprobada'),
    );
    expect((await api(`/admin/appeals/${submitted.body.appealId}`, 3, 'PATCH', { status: 'approved' })).status).toBe(
      200,
    );
    expect((await result).userId).toBe(users[0]);
    expect((await db.query('SELECT status FROM group_messages WHERE id=$1', [moderatedMessageId]))[0].status).toBe(
      'published',
    );
  });
  it('explica la suspensión antes de cerrar la conexión y mantiene revocado el token', async () => {
    // El contrato heredado compara iat en segundos; se separa la suspensión del segundo de emisión.
    const issuedAt = JSON.parse(Buffer.from(tokens[2].split('.')[1], 'base64url').toString()).iat as number;
    if (Date.now() < (issuedAt + 1) * 1000)
      await new Promise((resolve) => setTimeout(resolve, (issuedAt + 1) * 1000 - Date.now() + 20));
    const notice = event<{ message: string }>(outsider, 'account:suspended'),
      disconnected = event<string>(outsider, 'disconnect');
    expect(
      (
        await api(`/admin/users/${users[2]}/status`, 3, 'PATCH', {
          status: 'suspended',
          reason: 'Suspensión de prueba',
        })
      ).status,
    ).toBe(200);
    expect((await notice).message).toContain('Suspensión de prueba');
    await disconnected;
    expect((await api('/auth/me', 2)).status).toBe(401);
    expect(received[2]).toHaveLength(0);
    const rows = await db.query("SELECT id FROM notifications WHERE user_id=$1 AND title='Cuenta suspendida'", [
      users[2],
    ]);
    expect(rows).toHaveLength(1);
  });
  it('reactiva sin revivir el token antiguo y permite consultar la notificación con una sesión nueva', async () => {
    expect(
      (await api(`/admin/users/${users[2]}/status`, 3, 'PATCH', { status: 'active', reason: 'Fin de prueba' })).status,
    ).toBe(200);
    expect((await api('/auth/me', 2)).status).toBe(401);
    const result = await api('/auth/login', 2, 'POST', { email: `rt.${users[2]}@aloe.ulima.edu.pe`, password });
    expect(result.status).toBe(200);
    tokens[2] = result.body.accessToken;
    outsider = await connect(2);
    await expect
      .poll(async () =>
        (await api('/notifications/me', 2)).body.some((n: DeliveredNotification) => n.title === 'Cuenta reactivada'),
      )
      .toBe(true);
  });
  it('recupera por REST lo que quedó persistido durante una desconexión', async () => {
    member.disconnect();
    const n = await app
      .get(NotificationsService)
      .send({
        userId: users[1],
        title: 'Aviso sin conexión',
        message: 'Queda disponible al reconectar.',
        type: NotificationType.GROUP,
      });
    member = await connect(1);
    expect((await api('/notifications/me', 1)).body.some((row: DeliveredNotification) => row.id === n.id)).toBe(true);
  });
});
