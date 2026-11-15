import { describe, expect, it } from 'vitest';
import {
  buildModerationTextSql,
  MODERATED_CONTENT,
} from '../../src/modules/moderation/policies/moderated-content';
import { TargetContentType } from '../../src/modules/moderation/enums/moderation.enums';

describe('MODERATED_CONTENT y buildModerationTextSql', () => {
  it('incluye description, benefits y requirements al construir el SQL de publicaciones', () => {
    const sql = buildModerationTextSql(MODERATED_CONTENT[TargetContentType.PUBLICATION]);

    expect(sql).toContain('description');
    expect(sql).toContain('benefits');
    expect(sql).toContain('requirements');
    expect(sql).toContain('CONCAT_WS');
  });

  it('mantiene la columna directa para mensajes y reseñas', () => {
    expect(buildModerationTextSql(MODERATED_CONTENT[TargetContentType.MESSAGE])).toBe('content');
    expect(buildModerationTextSql(MODERATED_CONTENT[TargetContentType.REVIEW])).toBe('comment');
  });
});

