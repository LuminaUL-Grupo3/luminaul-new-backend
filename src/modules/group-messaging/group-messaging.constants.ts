import { DOMAIN_EVENTS } from '../../common/events/domain-events';

export const GROUP_DOMAIN_EVENTS = {
  CONTENT_CREATED: DOMAIN_EVENTS.CONTENT_CREATED,
  CONTENT_VISIBILITY_CHANGED: DOMAIN_EVENTS.CONTENT_VISIBILITY_CHANGED,
  CHAT_MESSAGE_HIDDEN: DOMAIN_EVENTS.CHAT_MESSAGE_HIDDEN,
  GROUP_CHANGED: DOMAIN_EVENTS.GROUP_CHANGED,
  GROUP_MEMBER_REMOVED: DOMAIN_EVENTS.GROUP_MEMBER_REMOVED,
  NOTIFICATION_SEND: DOMAIN_EVENTS.NOTIFICATION_SEND,
} as const;

export const GROUP_NOTICES = {
  JOIN_REQUEST_RECEIVED: (groupName: string) => ({
    title: 'Nueva solicitud de ingreso',
    message: `Recibiste una solicitud para unirse a «${groupName}». Revísala en Solicitudes.`,
  }),
  JOIN_REQUEST_APPROVED: (groupName: string) => ({
    title: 'Solicitud aceptada',
    message: `Tu solicitud para unirte a «${groupName}» fue aceptada. Ya puedes conversar con el grupo.`,
  }),
  JOIN_REQUEST_REJECTED: (groupName: string) => ({
    title: 'Solicitud rechazada',
    message: `Tu solicitud para unirte a «${groupName}» fue rechazada.`,
  }),
  MEMBER_KICKED: {
    title: 'Expulsión del grupo',
    message:
      'Fuiste expulsado del grupo de estudio por el líder. Puedes consultar tus grupos disponibles.',
  },
} as const;

export const GROUP_MESSAGES = {
  ADMIN_CANNOT_CREATE_GROUP: 'Los administradores no pueden crear grupos de estudio.',
  ADMIN_CANNOT_JOIN_GROUP: 'Los administradores no pueden solicitar ingreso a grupos de estudio.',
} as const;

