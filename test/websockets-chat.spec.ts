import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { SessionService } from '../src/modules/auth-security/services/session.service';
import { UsersRepository } from '../src/modules/auth-security/repositories/users.repository';
import { UserRole } from '../src/modules/auth-security/enums/user-role.enum';
import { UserAccountStatus } from '../src/modules/auth-security/enums/user-account-status.enum';

describe('Real-Time WebSockets: ChatGateway (SPEC-04)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;
  let wsUrl: string;

  let tokenLeader: string;
  let tokenMember: string;
  let tokenOutsider: string;

  let leaderId: string;
  let memberId: string;
  let outsiderId: string;

  let testGroupId: string;

  let socketLeader: Socket;
  let socketMember: Socket;
  let socketOutsider: Socket;

  const emitAck = (socket: Socket, event: string, payload: unknown): Promise<any> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout en emisión WS: ${event}`)), 5000);
      socket.emit(event, payload, (ack: any) => {
        clearTimeout(timer);
        resolve(ack);
      });
    });
  };

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'string' ? 3000 : address.port;
    baseUrl = `http://127.0.0.1:${port}`;
    wsUrl = baseUrl;

    dataSource = app.get(DataSource);
    const sessions = app.get(SessionService);
    const usersRepo = app.get(UsersRepository);

    const ts = Date.now();
    // Crear usuarios de prueba
    const uA = await usersRepo.createWithProfile(
      usersRepo.build({
        email: `ws_leader_${ts}@aloe.ulima.edu.pe`,
        name: 'WS Leader',
        passwordHash: 'dummy',
        role: UserRole.STUDENT,
        status: UserAccountStatus.ACTIVE,
        isVerified: true,
      }),
    );
    const uB = await usersRepo.createWithProfile(
      usersRepo.build({
        email: `ws_member_${ts}@aloe.ulima.edu.pe`,
        name: 'WS Member',
        passwordHash: 'dummy',
        role: UserRole.STUDENT,
        status: UserAccountStatus.ACTIVE,
        isVerified: true,
      }),
    );
    const uC = await usersRepo.createWithProfile(
      usersRepo.build({
        email: `ws_outsider_${ts}@aloe.ulima.edu.pe`,
        name: 'WS Outsider',
        passwordHash: 'dummy',
        role: UserRole.STUDENT,
        status: UserAccountStatus.ACTIVE,
        isVerified: true,
      }),
    );

    leaderId = uA.id;
    memberId = uB.id;
    outsiderId = uC.id;

    tokenLeader = sessions.issueAccessToken(uA);
    tokenMember = sessions.issueAccessToken(uB);
    tokenOutsider = sessions.issueAccessToken(uC);

    // Crear grupo de prueba directamente en BD
    const [group] = await dataSource.query(
      `INSERT INTO groups(name, description, course_code, leader_id, admin_id, meeting_mode, meeting_shift, max_capacity)
       VALUES($1, $2, $3, $4, $4, 'virtual', 'manana', 6)
       RETURNING id`,
      [`WS Grupo ${ts}`, 'Grupo para pruebas de WebSocket', 'CS001', leaderId],
    );
    testGroupId = group.id;

    // Membresías: uA líder, uB miembro, uC ajeno
    await dataSource.query(
      `INSERT INTO group_members(group_id, user_id, role, status)
       VALUES ($1, $2, 'leader', 'active'), ($1, $3, 'member', 'active')`,
      [testGroupId, leaderId, memberId],
    );
  }, 30000);

  afterAll(async () => {
    if (socketLeader?.connected) socketLeader.disconnect();
    if (socketMember?.connected) socketMember.disconnect();
    if (socketOutsider?.connected) socketOutsider.disconnect();

    if (dataSource?.isInitialized) {
      await dataSource.query('DELETE FROM groups WHERE id = $1', [testGroupId]).catch(() => {});
      await dataSource.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [leaderId, memberId, outsiderId]).catch(() => {});
    }

    await app.close();
  });

  describe('Handshake y Autenticación WebSocket', () => {
    it('debe conectar exitosamente con JWT Bearer válido en handshake.auth.token', (done) => {
      socketLeader = io(wsUrl, {
        auth: { token: tokenLeader },
        transports: ['websocket'],
        reconnection: false,
      });

      socketLeader.on('connect', () => {
        expect(socketLeader.connected).toBe(true);
        done();
      });

      socketLeader.on('connect_error', (err) => done(err));
    });

    it('debe rechazar conexión con connect_error ante JWT corrupto o ausente', (done) => {
      const corruptSocket = io(wsUrl, {
        auth: { token: 'invalid.corrupted.jwt' },
        transports: ['websocket'],
        reconnection: false,
      });

      corruptSocket.on('connect', () => {
        corruptSocket.disconnect();
        done(new Error('No debió permitir la conexión con token corrupto'));
      });

      corruptSocket.on('connect_error', (err) => {
        expect(err.message).toContain('La sesión no está disponible');
        corruptSocket.disconnect();
        done();
      });
    });
  });

  describe('Control de Acceso a Salas (chat:join_room)', () => {
    beforeAll((done) => {
      socketMember = io(wsUrl, {
        auth: { token: tokenMember },
        transports: ['websocket'],
        reconnection: false,
      });
      socketOutsider = io(wsUrl, {
        auth: { token: tokenOutsider },
        transports: ['websocket'],
        reconnection: false,
      });

      let ready = 0;
      const check = () => {
        ready++;
        if (ready === 2) done();
      };
      socketMember.on('connect', check);
      socketOutsider.on('connect', check);
    });

    it('debe permitir unirse a la sala a un miembro activo del grupo', async () => {
      const ackA = await emitAck(socketLeader, 'chat:join_room', { groupId: testGroupId });
      expect(ackA.success).toBe(true);
      expect(ackA.userIds).toContain(leaderId);

      const ackB = await emitAck(socketMember, 'chat:join_room', { groupId: testGroupId });
      expect(ackB.success).toBe(true);
      expect(ackB.userIds).toContain(memberId);
    });

    it('debe rechazar con FORBIDDEN a un usuario que no es miembro del grupo', async () => {
      const ackOutsider = await emitAck(socketOutsider, 'chat:join_room', { groupId: testGroupId });
      expect(ackOutsider.success).toBe(false);
      expect(ackOutsider.error?.code).toBe('FORBIDDEN');
    });
  });

  describe('Persistencia y Difusión de Mensajes (chat:send_message)', () => {
    it('debe entregar ACK al emisor, difundir chat:new_message al compañero y persistir en PostgreSQL', async () => {
      const messageContent = 'Mensaje de prueba automatizada WS';

      const receivePromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout esperando chat:new_message en socketLeader')), 5000);
        socketLeader.once('chat:new_message', (msg) => {
          clearTimeout(timeout);
          resolve(msg);
        });
      });

      // Member envía mensaje
      const sendAck = await emitAck(socketMember, 'chat:send_message', {
        groupId: testGroupId,
        content: messageContent,
      });

      expect(sendAck.success).toBe(true);
      expect(sendAck.message?.content).toBe(messageContent);
      const messageId = sendAck.message.id;

      // Leader recibe en tiempo real
      const received = await receivePromise;
      expect(received.content).toBe(messageContent);
      expect(received.sender.id).toBe(memberId);

      // Verificación estricta de persistencia relacional en PostgreSQL
      const [dbRow] = await dataSource.query(
        'SELECT id, group_id, sender_id, content, status FROM group_messages WHERE id = $1',
        [messageId],
      );
      expect(dbRow).toBeDefined();
      expect(dbRow.content).toBe(messageContent);
      expect(dbRow.sender_id).toBe(memberId);
      expect(dbRow.status).toBe('published');
    });

    it('debe rechazar con FORBIDDEN si un socket intenta enviar sin haber abierto la sala', async () => {
      // socketOutsider no está en la sala
      const failAck = await emitAck(socketOutsider, 'chat:send_message', {
        groupId: testGroupId,
        content: 'Intento no autorizado',
      });
      expect(failAck.success).toBe(false);
      expect(failAck.error?.code).toBe('FORBIDDEN');
    });
  });

  describe('Eventos Efímeros de Escritura (chat:typing)', () => {
    it('debe difundir chat:typing al compañero sin registrar en base de datos', async () => {
      const typingPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout esperando chat:typing')), 5000);
        socketLeader.once('chat:typing', (event) => {
          clearTimeout(timeout);
          resolve(event);
        });
      });

      const typingAck = await emitAck(socketMember, 'chat:typing', {
        groupId: testGroupId,
        isTyping: true,
      });
      expect(typingAck.success).toBe(true);

      const typingEvent = await typingPromise;
      expect(typingEvent.userId).toBe(memberId);
      expect(typingEvent.isTyping).toBe(true);
      expect(typingEvent.groupId).toBe(testGroupId);
    });
  });
});

