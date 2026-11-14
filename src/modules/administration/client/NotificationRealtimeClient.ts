import { NotificationDeliveryEvent } from '../../../common/events/notification-delivery.event';

/**
 * Puerto de salida para publicar cambios confirmados de notificaciones hacia el transporte en vivo.
 * La implementación sobre EventEmitter2 reside en impl/NotificationRealtimeClientImpl.ts.
 */
export abstract class NotificationRealtimeClient {
  abstract publishCreated(event: NotificationDeliveryEvent): void;
  abstract publishRead(userId: string, id: string): void;
}

