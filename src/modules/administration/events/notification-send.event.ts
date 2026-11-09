import { NotificationType } from '../enums/administration.enums';

// Payload del evento 'notification.send' (Observer): cualquier módulo lo emite con
// EventEmitter2 y NotificationsListener lo persiste, sin que el emisor conozca SPEC-07.
export interface NotificationSendEvent {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
}
