import { HttpStatus, Injectable } from '@nestjs/common';
import { NotificationsService } from '../NotificationsService';
import { NotificationsRepository } from '../../repository/NotificationsRepository';
import { NotificationSendEvent } from '../../events/notification-send.event';
import { MarkNotificationReadResponseDto, NotificationDto } from '../../dto/admin-response.dto';
import { AdminException } from '../../exception/AdminException';
import { ADMIN_MESSAGES, MAX_NOTIFICATIONS } from '../../administration.constants';

// Centro de notificaciones transversal: lo alimentan SPEC-04, SPEC-06 y el propio panel
@Injectable()
export class NotificationsServiceImpl extends NotificationsService {
  constructor(private readonly repository: NotificationsRepository) {
    super();
  }

  async send(event: NotificationSendEvent): Promise<NotificationDto> {
    return NotificationDto.fromEntity(await this.repository.create(event));
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
    return { message: ADMIN_MESSAGES.NOTIFICATION_READ, id: notification.id };
  }
}
