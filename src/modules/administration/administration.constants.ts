// Parámetros y mensajes de SPEC-07 (los literales de las HU 7.1–7.5 se respetan tal cual)

// Evento que otros módulos (SPEC-04, SPEC-06...) emiten para avisar a un alumno
export const NOTIFICATION_SEND_EVENT = 'notification.send';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_NOTIFICATIONS = 50;

export const ADMIN_MESSAGES = {
  USER_NOT_FOUND: 'Usuario no encontrado',
  CANNOT_CHANGE_OWN_STATUS: 'No puedes cambiar el estado de tu propia cuenta',
  CANNOT_SUSPEND_ADMIN: 'No se puede cambiar el estado de otro administrador',
  USER_NOT_VERIFIED: 'La cuenta aún no ha sido verificada por el alumno',
  USER_ALREADY_SUSPENDED: 'El usuario ya se encuentra suspendido',
  USER_ALREADY_ACTIVE: 'El usuario ya se encuentra activo',
  USER_SUSPENDED: 'Estado de usuario actualizado a suspendido. Sesiones activas revocadas.',
  USER_ACTIVATED: 'Estado de usuario actualizado a activo.',

  REPORT_NOT_FOUND: 'Reporte no encontrado',
  REPORT_ALREADY_RESOLVED: 'El reporte ya fue resuelto',
  DELETE_REQUIRES_RESOLVED: 'Solo se puede eliminar el contenido al resolver el reporte',
  CONTENT_NOT_FOUND: 'El contenido reportado ya no existe',
  UNSUPPORTED_CONTENT: 'Tipo de contenido no soportado',
  REPORT_RESOLVED: 'Reporte resuelto con éxito',
  REPORT_DISMISSED: 'Reporte desestimado con éxito',

  APPEAL_NOT_FOUND: 'Apelación no encontrada',
  APPEAL_ALREADY_RESOLVED: 'La apelación ya fue resuelta',
  APPEAL_APPROVED: 'Apelación aprobada con éxito',
  APPEAL_REJECTED: 'Apelación rechazada con éxito',

  NOTIFICATION_NOT_FOUND: 'Notificación no encontrada',
  NOTIFICATION_READ: 'Notificación marcada como leída',
} as const;

// Textos que recibe el alumno afectado por una decisión del administrador
export const NOTICES = {
  ACCOUNT_REACTIVATED: {
    title: 'Cuenta reactivada',
    message: 'Un administrador reactivó tu cuenta. Ya puedes volver a usar LuminaUL.',
  },
  APPEAL_APPROVED: {
    title: 'Apelación aprobada',
    message: 'Revisamos tu apelación: tu contenido fue restaurado y vuelve a estar visible.',
  },
  APPEAL_REJECTED: {
    title: 'Apelación rechazada',
    message: 'Revisamos tu apelación: el contenido seguirá oculto por incumplir las normas de la comunidad.',
  },
} as const;

// Acciones que quedan registradas en audit_logs
export enum AuditAction {
  USER_SUSPENDED = 'USER_SUSPENDED',
  USER_ACTIVATED = 'USER_ACTIVATED',
  REPORT_RESOLVED = 'REPORT_RESOLVED',
  REPORT_DISMISSED = 'REPORT_DISMISSED',
  APPEAL_APPROVED = 'APPEAL_APPROVED',
  APPEAL_REJECTED = 'APPEAL_REJECTED',
}
