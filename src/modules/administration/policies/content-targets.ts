import { ContentType } from '../enums/administration.enums';

// Tabla de configuración (no es un patrón del curso): qué tabla, columnas, estado y mensajes
// corresponden a cada tipo de contenido denunciable. Las tablas son de SPEC-03, SPEC-04 y SPEC-05: se tocan solo con SQL por
// nombre de tabla, sin importar sus entidades (AGENTS.md §3.2). Un tipo nuevo de contenido
// se agrega como una entrada más, sin modificar el service ni el DAO (OCP).
export interface ContentTarget {
  readonly table: string;
  readonly textColumn: string;
  readonly authorColumn: string;
  // Estado con el que queda el contenido al borrarlo de forma lógica
  readonly deletedStatus: string;
  readonly hasUpdatedAt: boolean;
  // Mensaje de éxito al eliminarlo (HU 7.2 exige "Post eliminado con éxito")
  readonly deletedMessage: string;
  // Aviso que recibe el autor cuando el administrador lo elimina
  readonly removedNotice: string;
}

export const CONTENT_TARGETS: Readonly<Record<ContentType, ContentTarget>> = {
  [ContentType.PUBLICATION]: {
    table: 'publications',
    textColumn: 'description',
    authorColumn: 'user_id',
    deletedStatus: 'inactive',
    hasUpdatedAt: true,
    deletedMessage: 'Post eliminado con éxito',
    removedNotice: 'Tu publicación fue eliminada por incumplir las normas de la comunidad.',
  },
  [ContentType.MESSAGE]: {
    table: 'group_messages',
    textColumn: 'content',
    authorColumn: 'sender_id',
    deletedStatus: 'deleted',
    hasUpdatedAt: false,
    deletedMessage: 'Mensaje eliminado con éxito',
    removedNotice: 'Tu mensaje fue eliminado por incumplir las normas de la comunidad.',
  },
  [ContentType.REVIEW]: {
    table: 'reviews',
    textColumn: 'comment',
    authorColumn: 'reviewer_id',
    deletedStatus: 'deleted',
    hasUpdatedAt: true,
    deletedMessage: 'Reseña eliminada con éxito',
    removedNotice: 'Tu reseña fue eliminada por incumplir las normas de la comunidad.',
  },
};

// Los target_type llegan desde la base de datos como texto libre: se validan antes de usarlos
export function resolveContentTarget(type: string): ContentTarget | null {
  return (CONTENT_TARGETS as Record<string, ContentTarget | undefined>)[type] ?? null;
}
