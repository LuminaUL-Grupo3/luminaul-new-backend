import { NotFoundException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { PostsService, EventEmitterLike } from '../posts.service';
import { PostsRepository } from '../posts.repository';
import { CoursesRepository } from '../../courses/courses.repository';
import { PostEntity } from '../entities/post.entity';
import { CourseEntity } from '../../courses/entities/course.entity';

describe('PostsService (Unit)', () => {
  let service: PostsService;
  let mockPostsRepo: jest.Mocked<PostsRepository>;
  let mockCoursesRepo: jest.Mocked<CoursesRepository>;
  let mockEventEmitter: jest.Mocked<EventEmitterLike>;

  const userId = 'user-uuid-author-1';
  const otherUserId = 'user-uuid-other-2';
  const courseId = 'course-uuid-1';

  beforeEach(() => {
    mockPostsRepo = {
      create: jest.fn(),
      getPosts: jest.fn(),
      getPostById: jest.fn(),
      getPostsByUser: jest.fn(),
      searchByFilter: jest.fn(),
      edit: jest.fn(),
      softDelete: jest.fn(),
      findGroupById: jest.fn(),
    } as unknown as jest.Mocked<PostsRepository>;

    mockCoursesRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<CoursesRepository>;

    mockEventEmitter = {
      emit: jest.fn(),
    };

    service = new PostsService(mockPostsRepo, mockCoursesRepo, mockEventEmitter);
  });

  describe('createPost', () => {
    it('debe crear un post y emitir content.created para moderación (Happy Path)', async () => {
      const course: Partial<CourseEntity> = {
        id: courseId,
        name: 'Ingeniería de Software I',
        cycle: 7,
      };
      mockCoursesRepo.findById.mockResolvedValue(course as CourseEntity);

      const fakeSavedPost: Partial<PostEntity> = {
        id: 'post-123',
        userId,
        courseId,
        type: 'study_group',
        description: 'Grupo de estudio para repasar parcial',
        benefits: 'Material resuelto',
        requirements: 'Puntualidad',
        maxCapacity: 5,
        status: 'published',
        createdAt: new Date(),
        updatedAt: new Date(),
        profile: {
          name: 'Autor Juan',
          profilePhotoUrl: null,
        } as any,
        course: course as CourseEntity,
      };

      mockPostsRepo.create.mockResolvedValue(fakeSavedPost as PostEntity);

      const result = await service.createPost(
        {
          courseId,
          type: 'study_group',
          description: 'Grupo de estudio para repasar parcial',
          benefits: 'Material resuelto',
          requirements: 'Puntualidad',
          maxCapacity: 5,
        },
        userId,
      );

      expect(result.id).toBe('post-123');
      expect(result.author?.name).toBe('Autor Juan');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'content.created',
        expect.objectContaining({
          contentType: 'publication',
          contentId: 'post-123',
          authorId: userId,
        }),
      );
    });

    it('debe lanzar UnprocessableEntityException si el curso no existe', async () => {
      mockCoursesRepo.findById.mockResolvedValue(null);

      await expect(
        service.createPost(
          {
            courseId: 'curso-invalido',
            type: 'study_group',
            description: 'Descripción válida',
          },
          userId,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('editPost', () => {
    it('debe lanzar NotFoundException si el post a editar no existe', async () => {
      mockPostsRepo.getPostById.mockResolvedValue(null);

      await expect(
        service.editPost('post-inexistente', { description: 'Nueva desc' }, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar ForbiddenException (BOLA / IDOR) si el post pertenece a otro usuario', async () => {
      const otherPost: Partial<PostEntity> = {
        id: 'post-of-other',
        userId: otherUserId,
      };
      mockPostsRepo.getPostById.mockResolvedValue(otherPost as PostEntity);

      await expect(
        service.editPost('post-of-other', { description: 'Hack desc' }, userId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deletePost', () => {
    it('debe lanzar ForbiddenException (BOLA / IDOR) si se intenta borrar un post ajeno', async () => {
      const otherPost: Partial<PostEntity> = {
        id: 'post-of-other',
        userId: otherUserId,
      };
      mockPostsRepo.getPostById.mockResolvedValue(otherPost as PostEntity);

      await expect(
        service.deletePost('post-of-other', userId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

