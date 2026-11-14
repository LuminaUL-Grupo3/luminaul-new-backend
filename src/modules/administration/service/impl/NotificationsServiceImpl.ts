import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationsService } from '../NotificationsService';
import { NotificationsRepository } from '../../repository/NotificationsRepository';
import { NotificationSendEvent } from '../../events/notification-send.event';
import { MarkNotificationReadResponseDto, NotificationDto } from '../../dto/admin-response.dto';
import { AdminException } from '../../exception/AdminException';
import { ADMIN_MESSAGES, MAX_NOTIFICATIONS } from '../../administration.constants';

// Centro de notificaciones transversal: lo alimentan SPEC-04, SPEC-06 y el propio panel
@Injectable()
export class NotificationsServiceImpl extends NotificationsService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly events: EventEmitter2,
  ) {
    super();
  }

  async send(event: NotificationSendEvent): Promise<NotificationDto> {
    const notification = NotificationDto.fromEntity(await this.repository.create(event));
    // Se publica exclusivamente después de guardar; un fallo de BD no produce un aviso ficticio.
    this.events.emit('notification.created', { notification, sessionRevoked: event.sessionRevoked });
    return notification;
  }

  async sendToAdministrators(event: Omit<NotificationSendEvent, 'userId'>): Promise<void> {
    const ids = await this.repository.administratorIds();
    await Promise.all(ids.map((userId) => this.send({ ...event, userId })));
  }

  async listMine(userId: string): Promise<NotificationDto[]> {
    const notifications = await this.repository.findByUser(userId, MAX_NOTIFICATIONS);
    return notifications.map((notification) => NotificationDto.fromEntity(notification));
  }

  async markRead(userId: string, notificationId: string): Promise<MarkNotificationReadResponseDto> {
    const notification = await this.repository.findOwn(notificationId, userId);
    if (!notification) {
      throw new AdminException(ADMIN_MESSAGES.NOTIFICATION_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (!notification.isRead) {
      await this.repository.markRead(notification.id);
    }
    this.events.emit('notification.read', { userId, id: notification.id });
    return { message: ADMIN_MESSAGES.NOTIFICATION_READ, id: notification.id };
  }
}
