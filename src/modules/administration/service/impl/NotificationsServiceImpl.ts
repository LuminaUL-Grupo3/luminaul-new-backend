import { HttpStatus, Injectable } from '@nestjs/common';
import { NotificationsService } from '../NotificationsService';
import { NotificationsRepository } from '../../repository/NotificationsRepository';
import {
  AdministratorNotificationEvent,
  NotificationSendEvent,
} from '../../events/notification-send.event';
import { MarkNotificationReadResponseDto, NotificationDto } from '../../dto/admin-response.dto';
import { AdminException } from '../../exception/AdminException';
import { ADMIN_MESSAGES, MAX_NOTIFICATIONS } from '../../administration.constants';
import { NotificationRealtimeClient } from '../../client/NotificationRealtimeClient';
import { AdminDirectoryClient } from '../../client/AdminDirectoryClient';

// Centro de notificaciones transversal: lo alimentan SPEC-04, SPEC-06 y el propio panel
@Injectable()
export class NotificationsServiceImpl extends NotificationsService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly realtimeClient: NotificationRealtimeClient,
    private readonly adminDirectory: AdminDirectoryClient,
  ) {
    super();
  }

  async send(event: NotificationSendEvent): Promise<NotificationDto> {
    const notification = NotificationDto.fromEntity(await this.repository.create(event));
    // Se publica exclusivamente después de guardar; un fallo de BD no produce un aviso ficticio.
    this.realtimeClient.publishCreated({
      notification,
      sessionRevoked: event.sessionRevoked,
    });
    return notification;
  }

  async sendToAdministrators(event: AdministratorNotificationEvent): Promise<void> {
    const ids = await this.adminDirectory.findActiveAdminIds();
    if (!ids.length) return;
    const saved = await this.repository.createMany(ids.map((userId) => ({ ...event, userId })));
    for (const entity of saved) {
      this.realtimeClient.publishCreated({
        notification: NotificationDto.fromEntity(entity),
        sessionRevoked: event.sessionRevoked,
      });
    }
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
    this.realtimeClient.publishRead(userId, notification.id);
    return { message: ADMIN_MESSAGES.NOTIFICATION_READ, id: notification.id };
  }
}
