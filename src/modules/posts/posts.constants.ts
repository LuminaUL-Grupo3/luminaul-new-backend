import { DOMAIN_EVENTS } from '../../common/events/domain-events';

export const POST_TYPES = {
  STUDY_GROUP: 'study_group',
  TUTORING: 'tutoring',
} as const;

export type PostType = (typeof POST_TYPES)[keyof typeof POST_TYPES];

export const POST_STATUS = {
  PUBLISHED: 'published',
  HIDDEN: 'hidden',
  DELETED: 'deleted',
} as const;

export const POST_MESSAGES = {
  EMPTY_DESCRIPTION: 'La descripción no puede estar vacía',
  INVALID_MAX_CAPACITY: 'maxCapacity debe estar entre 2 y 8',
  COURSE_NOT_FOUND: 'Curso no encontrado',
  GROUP_NOT_FOUND: 'El grupo especificado no existe',
  POST_NOT_FOUND: 'Publicación no encontrada',
  FORBIDDEN_EDIT: 'No tienes permiso para editar esta publicación',
  FORBIDDEN_DELETE: 'No tienes permiso para eliminar esta publicación',
  DELETED_SUCCESS: 'Publicación eliminada con éxito',
  UNSUPPORTED_TYPE: 'type debe ser tutoring o study_group',
  TUTORING_ONLY_REQUESTS: 'Solo se pueden enviar solicitudes de asesoría a publicaciones de asesoría',
  TUTORING_SELF_REQUEST: 'No puedes solicitar tu propia asesoría',
  TUTORING_ALREADY_ACCEPTED: 'Tu solicitud de asesoría ya fue aceptada',
  TUTORING_ALREADY_PENDING: 'Ya tienes una solicitud pendiente para esta asesoría',
  TUTORING_REQUEST_SENT: 'Solicitud de asesoría enviada al tutor',
  TUTORING_REQUEST_NOT_FOUND: 'Solicitud de asesoría no encontrada',
  TUTORING_REQUEST_FORBIDDEN: 'No tienes permiso para responder esta solicitud de asesoría',
  TUTORING_REQUEST_ALREADY_DECIDED: 'Esta solicitud de asesoría ya fue respondida',
} as const;

export const CONTENT_CREATED_EVENT = DOMAIN_EVENTS.CONTENT_CREATED;

/**
 * Token de Inyección de Dependencias para los creadores de publicaciones (Factory Method / Multi-provider).
 */
export const POST_CREATORS = Symbol('POST_CREATORS');

