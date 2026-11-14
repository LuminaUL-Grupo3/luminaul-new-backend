import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { SessionService } from '../../auth-security/service/SessionService';
import { extractToken } from '../../auth-security/token/TokenExtractor';
import {
  DeliveredNotification,
  NotificationDeliveryEvent,
} from '../../../common/events/notification-delivery.event';
import {
  NOTIFICATION_CREATED_EVENT,
  NOTIFICATION_READ_EVENT,
} from '../administration.constants';
import { NotificationReadEvent } from '../events/notification-send.event';

interface NotificationSocketData {
  token: string;
  userId: string;
}

interface NotificationServerEvents {
  'notifications:ready': () => void;
  'notification:new': (notification: DeliveredNotification) => void;
  'notification:read': (event: { id: string }) => void;
  'account:suspended': (event: { message: string }) => void;
}

type NotificationSocket = Socket<
  Record<string, never>,
  NotificationServerEvents,
  Record<string, never>,
  NotificationSocketData
>;

type NotificationServer = Namespace<
  Record<string, never>,
  NotificationServerEvents,
  Record<string, never>,
  NotificationSocketData
>;

function originAllowed(origin?: string): boolean {
  const origins = (
    process.env.WEB_ORIGIN ||
    process.env.FRONTEND_URL ||
    'http://localhost:5173,http://127.0.0.1:5173'
  )
    .split(',')
    .map((value) => value.trim());
  return !origin || origins.includes(origin);
}

/**
 * Transporte Socket.IO dedicado a notificaciones privadas (SPEC-07), desacoplado de ChatGateway (SPEC-04).
 */
@WebSocketGateway({
  namespace: '/notifications',
  maxHttpBufferSize: 32 * 1024,
  cors: {
    origin: (origin, callback) => callback(null, originAllowed(origin)),
    credentials: true,
  },
  allowRequest: (request, callback) =>
    callback(null, originAllowed(request.headers.origin)),
})
export class NotificationsGateway
  implements
    OnGatewayInit<NotificationServer>,
    OnGatewayConnection<NotificationSocket>
{
  @WebSocketServer() private server!: NotificationServer;
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly sessions: SessionService) {}

  afterInit(server: NotificationServer): void {
    server.use((socket, next) => {
      const authToken: unknown = socket.handshake.auth?.token;
      const token =
        typeof authToken === 'string'
          ? authToken
          : extractToken(
              socket.handshake.headers.authorization,
              socket.handshake.headers.cookie,
            );
      if (!token) {
        next(new Error('La sesión no está disponible. Inicia sesión nuevamente.'));
        return;
      }
      this.sessions
        .validate(token)
        .then(({ user }) => {
          if (!user.isVerified) {
            next(new Error('Verifica tu cuenta para continuar.'));
            return;
          }
          socket.data = { token, userId: user.id };
          next();
        })
        .catch(() =>
          next(new Error('La sesión no está disponible. Inicia sesión nuevamente.')),
        );
    });
  }

  /** Cada conexión autenticada ingresa solo a su sala privada; el cliente no elige destinatarios. */
  async handleConnection(socket: NotificationSocket): Promise<void> {
    await socket.join(`room:user:${socket.data.userId}`);
    socket.emit('notifications:ready');
  }

  @OnEvent(NOTIFICATION_CREATED_EVENT, { async: true })
  async onNotificationCreated(event: NotificationDeliveryEvent): Promise<void> {
    const sockets = await this.socketsForUser(event.notification.userId);
    for (const socket of sockets) {
      const valid = await this.verifySession(socket);
      if (valid) {
        socket.emit('notification:new', event.notification);
        continue;
      }
      if (event.sessionRevoked) {
        socket.emit('account:suspended', {
          message: event.notification.message,
        });
      }
      socket.disconnect(true);
    }
  }

  @OnEvent(NOTIFICATION_READ_EVENT, { async: true })
  async onNotificationRead(event: NotificationReadEvent): Promise<void> {
    const sockets = await this.socketsForUser(event.userId);
    for (const socket of sockets) {
      if (await this.verifySession(socket)) {
        socket.emit('notification:read', { id: event.id });
      } else {
        socket.disconnect(true);
      }
    }
  }

  private async socketsForUser(userId: string): Promise<NotificationSocket[]> {
    if (!this.server) return [];
    const room = `room:user:${userId}`;
    const adapter = this.server.adapter;
    const ids = adapter?.rooms?.get(room);
    if (!ids) return [];
    const sockets: NotificationSocket[] = [];
    for (const id of [...ids]) {
      const socket = this.server.sockets.get(id);
      if (socket && socket.data.userId === userId) {
        sockets.push(socket);
      }
    }
    return sockets;
  }

  private async verifySession(socket: NotificationSocket): Promise<boolean> {
    try {
      const { user } = await this.sessions.validate(socket.data.token);
      return user.isVerified;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Sesión revocada para socket de notificaciones: ${reason}`);
      return false;
    }
  }
}
