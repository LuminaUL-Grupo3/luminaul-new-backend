import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GROUP_DOMAIN_EVENTS } from '../../group-messaging.constants';
import { MembershipRemovedEvent } from '../../types/messaging.types';
import {
  GroupContentCreatedPayload,
  GroupEventsClient,
  GroupUserNotice,
} from '../GroupEventsClient';

/** Adapter sobre EventEmitter2 para eventos de grupos, moderación y notificaciones (SPEC-04). */
@Injectable()
export class GroupEventsClientImpl extends GroupEventsClient {
  constructor(@Optional() private readonly eventEmitter?: EventEmitter2) {
    super();
  }

  notifyUser(notice: GroupUserNotice): void {
    this.eventEmitter?.emit(GROUP_DOMAIN_EVENTS.NOTIFICATION_SEND, notice);
  }

  emitGroupChanged(groupId: string): void {
    this.eventEmitter?.emit(GROUP_DOMAIN_EVENTS.GROUP_CHANGED, { groupId });
  }

  async emitMemberRemoved(event: MembershipRemovedEvent): Promise<void> {
    await this.eventEmitter?.emitAsync(
      GROUP_DOMAIN_EVENTS.GROUP_MEMBER_REMOVED,
      event,
    );
  }

  emitContentCreated(payload: GroupContentCreatedPayload): void {
    this.eventEmitter?.emit(GROUP_DOMAIN_EVENTS.CONTENT_CREATED, payload);
  }
}

