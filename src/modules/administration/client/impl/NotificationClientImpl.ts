import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationClient } from '../NotificationClient';
import { NotificationSendEvent } from '../../events/notification-send.event';
import { NOTIFICATION_SEND_EVENT } from '../../administration.constants';

/**
 * Patrón Adapter: adapta notify() a la API de EventEmitter2 (el Adaptee), como YapeAdapter
 * adapta el cobro a la API de Yape. Emite 'notification.send', que guarda
 * NotificationsListener en la tabla notifications sin bloquear la respuesta HTTP.
 */
@Injectable()
export class NotificationClientImpl extends NotificationClient {
  constructor(private readonly eventEmitter: EventEmitter2) {
    super();
  }

  notify(notice: NotificationSendEvent): void {
    this.eventEmitter.emit(NOTIFICATION_SEND_EVENT, notice);
  }
}
