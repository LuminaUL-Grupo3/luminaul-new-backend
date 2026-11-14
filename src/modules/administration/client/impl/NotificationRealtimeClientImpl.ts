import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationDeliveryEvent } from '../../../../common/events/notification-delivery.event';
import {
  NOTIFICATION_CREATED_EVENT,
  NOTIFICATION_READ_EVENT,
} from '../../administration.constants';
import { NotificationRealtimeClient } from '../NotificationRealtimeClient';

/** Adapter sobre EventEmitter2 para desacoplar NotificationsServiceImpl del bus de eventos. */
@Injectable()
export class NotificationRealtimeClientImpl extends NotificationRealtimeClient {
  constructor(@Optional() private readonly eventEmitter?: EventEmitter2) {
    super();
  }

  publishCreated(event: NotificationDeliveryEvent): void {
    this.eventEmitter?.emit(NOTIFICATION_CREATED_EVENT, event);
  }

  publishRead(userId: string, id: string): void {
    this.eventEmitter?.emit(NOTIFICATION_READ_EVENT, { userId, id });
  }
}
