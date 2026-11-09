import { NotificationEntity } from '../entities/notification.entity';
import { NotificationSendEvent } from '../events/notification-send.event';

/**
 * Patrón DAO del centro de notificaciones (tabla notifications, propia de SPEC-07).
 * La implementación con TypeORM está en impl/NotificationsRepositoryImpl.ts.
 */
export abstract class NotificationsRepository {
  abstract create(values: NotificationSendEvent): Promise<NotificationEntity>;
  abstract findByUser(userId: string, limit: number): Promise<NotificationEntity[]>;
  // Filtra por dueño: una notificación ajena se comporta igual que una inexistente
  abstract findOwn(id: string, userId: string): Promise<NotificationEntity | null>;
  abstract markRead(id: string): Promise<void>;
}
