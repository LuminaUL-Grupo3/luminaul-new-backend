import { NotificationSendEvent } from '../events/notification-send.event';
import { MarkNotificationReadResponseDto, NotificationDto } from '../dto/admin-response.dto';

/**
 * Casos de uso del centro de notificaciones (SPEC-07). Lo usan NotificationsController
 * (el alumno ve y marca sus avisos) y NotificationsListener (guarda los avisos que emiten
 * los demás módulos). La implementación está en impl/NotificationsServiceImpl.ts.
 */
export abstract class NotificationsService {
  abstract send(event: NotificationSendEvent): Promise<NotificationDto>;
  abstract listMine(userId: string): Promise<NotificationDto[]>;
  abstract markRead(userId: string, notificationId: string): Promise<MarkNotificationReadResponseDto>;
}
