import { DOMAIN_EVENTS } from '../../common/events/domain-events';

// Contratos de eventos y mensajes de SPEC-06 (Moderación automática y denuncias).

// Evento que emiten posts (SPEC-03), chat (SPEC-04) y reseñas (SPEC-05) al crear o editar texto
export const CONTENT_CREATED_EVENT = DOMAIN_EVENTS.CONTENT_CREATED;

// Evento interno que el ChatGateway (SPEC-04) retransmite a la sala por WebSocket
export const CHAT_MESSAGE_HIDDEN_EVENT = DOMAIN_EVENTS.CHAT_MESSAGE_HIDDEN;

// Eventos de notificación consumidos por NotificationsListener (SPEC-07)
export const NOTIFICATION_SEND_EVENT = DOMAIN_EVENTS.NOTIFICATION_SEND;
export const NOTIFICATION_ADMINISTRATORS_EVENT = DOMAIN_EVENTS.NOTIFICATION_ADMINISTRATORS;

export const MODERATION_MESSAGES = {
  REPORT_CREATED:
    'Tu reporte fue enviado con éxito. El equipo de administración revisará el caso.',
  // Texto del criterio de aceptación de HU 6.1 (escenario de reporte duplicado)
  REPORT_DUPLICATED: 'Ya reportaste este contenido anteriormente',
  TARGET_NOT_FOUND: 'El contenido que intentas reportar no existe o fue eliminado',
  SELF_REPORT: 'No puedes reportar tu propio contenido',
  APPEAL_CREATED: 'Apelación enviada al equipo de moderación',
  APPEAL_DUPLICATED: 'Ya existe una apelación para esta moderación',
  LOG_NOT_FOUND: 'No se encontró la moderación indicada',
  NOTIFICATION_TITLE: 'Contenido ocultado por moderación',
} as const;

export const MODERATION_NOTICES = {
  REPORT_RECEIVED: {
    title: 'Reporte recibido',
    message: 'Tu reporte fue registrado y será revisado por administración.',
    type: 'MODERATION',
  },
  REPORT_PENDING_ADMIN: {
    title: 'Nuevo reporte pendiente',
    message: 'Se registró un reporte de contenido. Revisa el panel de reportes.',
    type: 'MODERATION',
  },
  APPEAL_PENDING_ADMIN: {
    title: 'Nueva apelación pendiente',
    message: 'Se registró una apelación de moderación. Revisa el panel de apelaciones.',
    type: 'MODERATION',
  },
} as const;
