import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '../entities/notification.entity';
import { NotificationSendEvent } from '../events/notification-send.event';

@Injectable()
export class NotificationsRepository {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
  ) {}

  create(values: NotificationSendEvent): Promise<NotificationEntity> {
    return this.notifications.save(this.notifications.create(values));
  }

  findByUser(userId: string, limit: number): Promise<NotificationEntity[]> {
    return this.notifications.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // Filtra por dueño: una notificación ajena se comporta igual que una inexistente
  findOwn(id: string, userId: string): Promise<NotificationEntity | null> {
    return this.notifications.findOne({ where: { id, userId } });
  }

  async markRead(id: string): Promise<void> {
    await this.notifications.update({ id }, { isRead: true });
  }
}
