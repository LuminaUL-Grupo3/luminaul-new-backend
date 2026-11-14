import 'reflect-metadata';
import { validate } from 'class-validator';
import { POST_COLORS } from '../post-colors';
import { PostUpdateDto } from '../dto/post-update.dto';
import { PostCreateDto } from '../dto/post-create.dto';
import { TutoringPostCreator } from '../factory/impl/TutoringPostCreator';
import { GroupMessagingClient } from '../client/GroupMessagingClient';

describe('Color pastel de publicaciones', () => {
  it.each(POST_COLORS)('acepta y conserva %s en el creador', async (color) => {
    const dto = Object.assign(new PostCreateDto(), {
      color,
      type: 'tutoring',
      courseId: '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
      description: 'Repaso de ejercicios',
    });
    expect(
      (await validate(dto)).filter((e) => e.property === 'color'),
    ).toHaveLength(0);
    expect(
      await validate(Object.assign(new PostUpdateDto(), { color })),
    ).toHaveLength(0);
    const creator = new TutoringPostCreator({} as GroupMessagingClient);
    expect(
      (await creator.create(dto, 'user', { id: dto.courseId, name: 'Curso' }))
        .color,
    ).toBe(color);
  });
  it.each(['red', '#ffffff', null, 'url(javascript:test)'])(
    'rechaza valores externos a la paleta: %s',
    async (color) => {
      expect(
        (await validate(Object.assign(new PostUpdateDto(), { color }))).some(
          (e) => e.property === 'color',
        ),
      ).toBe(true);
      expect(
        (await validate(Object.assign(new PostCreateDto(), { color }))).some(
          (e) => e.property === 'color',
        ),
      ).toBe(true);
    },
  );
  it('conserva compatibilidad al omitir el color', async () => {
    expect(await validate(new PostUpdateDto())).toHaveLength(0);
    const creator = new TutoringPostCreator({} as GroupMessagingClient);
    expect(
      (
        await creator.create(
          { type: 'tutoring', description: 'Repaso', courseId: 'course' },
          'user',
          { id: 'course', name: 'Curso' },
        )
      ).color,
    ).toBe('peach');
  });
});
