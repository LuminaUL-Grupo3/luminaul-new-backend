import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NOTIFICATION_ADMINISTRATORS_EVENT,
  NOTIFICATION_SEND_EVENT,
} from '../../moderation.constants';
import {
  ModerationAdminNotice,
  ModerationUserNotice,
  NotificationClient,
} from '../NotificationClient';

/** Adapter sobre EventEmitter2 para emitir notificaciones hacia SPEC-07 sin acoplar el servicio. */
@Injectable()
export class NotificationClientImpl extends NotificationClient {
  constructor(@Optional() private readonly eventEmitter?: EventEmitter2) {
    super();
  }

  notifyUser(notice: ModerationUserNotice): void {
    this.eventEmitter?.emit(NOTIFICATION_SEND_EVENT, notice);
  }

  notifyAdministrators(notice: ModerationAdminNotice): void {
    this.eventEmitter?.emit(NOTIFICATION_ADMINISTRATORS_EVENT, notice);
  }
}

