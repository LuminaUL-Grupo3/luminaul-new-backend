import { TargetContentType } from '../enums/moderation.enums';

// Payload de 'content.created' tal como lo emiten PostsService (SPEC-03),
// GroupMessagingService (SPEC-04) y ModerationClientImpl (SPEC-05)
export interface ContentCreatedEvent {
  contentType: TargetContentType;
  contentId: string;
  authorId: string;
  text: string;
  // Solo llega en mensajes de chat
  groupId?: string;
}

// Payload que escucha el ChatGateway para retirar el mensaje de las pantallas abiertas
export interface ChatMessageHiddenEvent {
  groupId: string;
  messageId: string;
}

// Payload de 'notification.send' (contrato de SPEC-07)
export interface ModerationNotificationEvent {
  userId: string;
  title: string;
  message: string;
  type: 'MODERATION';
}
