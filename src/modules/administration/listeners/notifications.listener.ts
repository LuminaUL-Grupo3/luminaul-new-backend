import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../services/notifications.service';
import { NotificationSendEvent } from '../events/notification-send.event';
import { NOTIFICATION_SEND_EVENT } from '../administration.constants';

// Observer: suscriptor del evento 'notification.send'. Un fallo al guardar la notificación
// queda en el log y no rompe la operación que la originó (moderar, expulsar, resolver...).
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger('NotificationsListener');

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(NOTIFICATION_SEND_EVENT, { async: true })
  async handle(event: NotificationSendEvent): Promise<void> {
    try {
      await this.notifications.send(event);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`No se pudo registrar la notificación para ${event.userId}: ${reason}`);
    }
  }
}
