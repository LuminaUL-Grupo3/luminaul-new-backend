// Valores y mensajes de SPEC-05 en un solo lugar (DRY): los usan los DTOs, las reglas,
// el servicio y las pruebas. Los textos visibles para el alumno son los de los criterios de
// aceptación de las HU 5.1–5.4 (Épica 5).

export const REVIEW_LIMITS = {
  MIN_RATING: 1,
  MAX_RATING: 5,
  MAX_COMMENT_LENGTH: 1000,
} as const;

export const REVIEW_MESSAGES = {
  INVALID_USER_ID: 'reviewedUserId debe ser un UUID válido',
  INVALID_PARAM_ID: 'El identificador de la ruta debe ser un UUID v4 válido',
  RATING_NOT_INTEGER: 'Debe seleccionar una calificación',
  RATING_TOO_LOW: 'El rating mínimo es 1 estrella',
  RATING_TOO_HIGH: 'El rating máximo es 5 estrellas',
  EMPTY_COMMENT: 'Debe ingresar un comentario',
  COMMENT_TOO_LONG: 'El comentario no puede superar los 1000 caracteres',
  SELF_REVIEW: 'No puedes calificarte a ti mismo',
  NO_SHARED_GROUP: 'Solo puedes calificar a estudiantes con los que hayas estudiado previamente',
  ALREADY_REVIEWED: 'Ya dejaste una reseña para este usuario',
  NOT_AUTHOR: 'Solo el autor de la reseña puede modificarla o eliminarla',
  NOT_FOUND: 'Reseña no encontrada',
  DELETED: 'Reseña eliminada con éxito',
} as const;

export const REVIEW_STATUS = {
  PUBLISHED: 'published',
  HIDDEN: 'hidden',
  DELETED: 'deleted',
} as const;

export type ReviewStatus = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS];

// Token de DI de la lista ordenada de reglas de elegibilidad (el orden lo fija ReviewsModule)
export const REVIEW_ELIGIBILITY_RULES = Symbol('REVIEW_ELIGIBILITY_RULES');

// Evento que escucha el motor de moderación de SPEC-06 (el mismo que emite PostsService)
export const CONTENT_CREATED_EVENT = 'content.created';
