/**
 * Catálogo centralizado de eventos de dominio emitidos vía EventEmitter2 (AGENTS.md §2 y §3.3).
 * Ningún servicio emite ni escucha strings literales; todo pasa por estas constantes y client/impl/.
 */
export const DOMAIN_EVENTS = {
  CONTENT_CREATED: 'content.created',
  CONTENT_VISIBILITY_CHANGED: 'content.visibility_changed',
  CHAT_MESSAGE_HIDDEN: 'chat:message_hidden',
  GROUP_CHANGED: 'group.changed',
  GROUP_MEMBER_REMOVED: 'group.member_removed',
  NOTIFICATION_SEND: 'notification.send',
  NOTIFICATION_ADMINISTRATORS: 'notification.administrators',
  NOTIFICATION_CREATED: 'notification.created',
  NOTIFICATION_READ: 'notification.read',
} as const;

export type DomainEventName = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

