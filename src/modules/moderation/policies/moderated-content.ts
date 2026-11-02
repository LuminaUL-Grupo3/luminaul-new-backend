import { TargetContentType } from '../enums/moderation.enums';

// Strategy: dónde vive cada tipo de contenido moderable. Las tablas son de SPEC-03, SPEC-04
// y SPEC-05; se leen y actualizan con SQL por nombre de tabla, sin importar sus entidades
// (AGENTS.md §3.2). Un tipo nuevo se agrega como una entrada más (abierto/cerrado).
export interface ModeratedContentSource {
  readonly table: string;
  readonly authorColumn: string;
  // Columna con el texto que se moderó
  readonly textColumn: string;
  // Columna con el grupo del mensaje; solo existe en el chat
  readonly groupColumn: string | null;
  // Etiqueta para el aviso al autor
  readonly label: string;
}

export const MODERATED_CONTENT: Readonly<Record<TargetContentType, ModeratedContentSource>> = {
  [TargetContentType.PUBLICATION]: {
    table: 'publications',
    authorColumn: 'user_id',
    textColumn: 'description',
    groupColumn: null,
    label: 'publicación',
  },
  [TargetContentType.MESSAGE]: {
    table: 'group_messages',
    authorColumn: 'sender_id',
    textColumn: 'content',
    groupColumn: 'group_id',
    label: 'mensaje',
  },
  [TargetContentType.REVIEW]: {
    table: 'reviews',
    authorColumn: 'reviewer_id',
    textColumn: 'comment',
    groupColumn: null,
    label: 'reseña',
  },
};

// Los tipos llegan como texto libre en los eventos: se validan antes de armar el SQL
export function resolveModeratedContent(type: string): ModeratedContentSource | null {
  return (MODERATED_CONTENT as Record<string, ModeratedContentSource | undefined>)[type] ?? null;
}
