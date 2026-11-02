import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationsRepository } from '../repositories/notifications.repository';
import { NotificationEntity } from '../entities/notification.entity';
import { NotificationSendEvent } from '../events/notification-send.event';
import { MarkNotificationReadResponseDto, NotificationDto } from '../dto/admin-response.dto';
import { ADMIN_MESSAGES, MAX_NOTIFICATIONS } from '../administration.constants';

const toNotificationDto = (notification: NotificationEntity): NotificationDto => ({
  id: notification.id,
  userId: notification.userId,
  title: notification.title,
  message: notification.message,
  type: notification.type,
  isRead: notification.isRead,
  createdAt: notification.createdAt.toISOString(),
});

// Centro de notificaciones transversal: lo alimentan SPEC-04, SPEC-06 y el propio panel
@Injectable()
export class NotificationsService {
  constructor(private readonly repository: NotificationsRepository) {}

  async send(event: NotificationSendEvent): Promise<NotificationDto> {
    return toNotificationDto(await this.repository.create(event));
  }

  async listMine(userId: string): Promise<NotificationDto[]> {
    const notifications = await this.repository.findByUser(userId, MAX_NOTIFICATIONS);
    return notifications.map(toNotificationDto);
  }

  async markRead(userId: string, notificationId: string): Promise<MarkNotificationReadResponseDto> {
    const notification = await this.repository.findOwn(notificationId, userId);
    if (!notification) {
      throw new NotFoundException(ADMIN_MESSAGES.NOTIFICATION_NOT_FOUND);
    }
    if (!notification.isRead) {
      await this.repository.markRead(notification.id);
    }
    return { message: ADMIN_MESSAGES.NOTIFICATION_READ, id: notification.id };
  }
}
