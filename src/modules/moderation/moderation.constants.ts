// Contratos de eventos y mensajes de SPEC-06 (Moderación automática y denuncias).

// Evento que emiten posts (SPEC-03), chat (SPEC-04) y reseñas (SPEC-05) al crear o editar texto
export const CONTENT_CREATED_EVENT = 'content.created';

// Evento interno que el ChatGateway (SPEC-04) retransmite a la sala por WebSocket
export const CHAT_MESSAGE_HIDDEN_EVENT = 'chat:message_hidden';

// Evento que persiste NotificationsListener (SPEC-07)
export const NOTIFICATION_SEND_EVENT = 'notification.send';

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
