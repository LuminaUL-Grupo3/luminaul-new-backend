import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '../../entities/notification.entity';
import { NotificationSendEvent } from '../../events/notification-send.event';
import { NotificationsRepository } from '../NotificationsRepository';

/**
 * Patrón DAO: implementación de NotificationsRepository con el repositorio de TypeORM
 * de la entidad propia NotificationEntity.
 */
@Injectable()
export class NotificationsRepositoryImpl extends NotificationsRepository {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
  ) {
    super();
  }

  create(values: NotificationSendEvent): Promise<NotificationEntity> {
    const { userId, title, message, type } = values;
    return this.notifications.save(this.notifications.create({ userId, title, message, type }));
  }

  /** Resuelve destinatarios dentro del DAO; nunca acepta una sala o lista de usuarios del cliente. */
  async administratorIds(): Promise<string[]> {
    const rows: { id: string }[] = await this.notifications.manager.query(
      "SELECT id FROM users WHERE role='admin' AND status='active' AND deleted_at IS NULL",
    );
    return rows.map((row) => row.id);
  }

  findByUser(userId: string, limit: number): Promise<NotificationEntity[]> {
    return this.notifications.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  findOwn(id: string, userId: string): Promise<NotificationEntity | null> {
    return this.notifications.findOne({ where: { id, userId } });
  }

  async markRead(id: string): Promise<void> {
    await this.notifications.update({ id }, { isRead: true });
  }
}
