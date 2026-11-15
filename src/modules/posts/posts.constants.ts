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
  EMPTY_DESCRIPTION: 'description cannot be empty',
  INVALID_MAX_CAPACITY: 'maxCapacity must be between 1 and 50',
  COURSE_NOT_FOUND: 'Course not found',
  GROUP_NOT_FOUND: 'Specified group not found',
  POST_NOT_FOUND: 'Post not found',
  FORBIDDEN_EDIT: 'You do not have permission to edit this post',
  FORBIDDEN_DELETE: 'You do not have permission to delete this post',
  DELETED_SUCCESS: 'Post deleted successfully',
  UNSUPPORTED_TYPE: 'type must be tutoring or study_group',
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

