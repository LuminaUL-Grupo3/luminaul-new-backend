import { MembershipRemovedEvent } from '../types/messaging.types';

export interface GroupUserNotice {
  userId: string;
  title: string;
  message: string;
  type: 'GROUP';
}

export interface GroupContentCreatedPayload {
  contentType: 'message';
  contentId: string;
  authorId: string;
  text: string;
  groupId: string;
}

/** Puerto de eventos del módulo group-messaging; desacopla el servicio de EventEmitter2. */
export abstract class GroupEventsClient {
  abstract notifyUser(notice: GroupUserNotice): void;
  abstract emitGroupChanged(groupId: string): void;
  abstract emitMemberRemoved(event: MembershipRemovedEvent): Promise<void>;
  abstract emitContentCreated(payload: GroupContentCreatedPayload): void;
}

