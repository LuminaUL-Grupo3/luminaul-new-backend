import { NotFoundException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { type Mocked } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PostFilterQueryDto } from '../dto/post-query.dto';
import { PostsService } from '../service/PostsService';
import { PostsServiceImpl } from '../service/impl/PostsServiceImpl';
import { PostsRepository } from '../repository/PostsRepository';
import { CoursesClient, CourseData } from '../client/CoursesClient';
import { ModerationClient } from '../client/ModerationClient';
import { GroupMessagingClient } from '../client/GroupMessagingClient';
import { PostCreatorFactory } from '../factory/PostCreatorFactory';
import { StudyGroupPostCreator } from '../factory/impl/StudyGroupPostCreator';
import { TutoringPostCreator } from '../factory/impl/TutoringPostCreator';
import { PostEntity } from '../entities/post.entity';
import { POST_TYPES } from '../posts.constants';

describe('PostsModule Patterns (Unit Tests)', () => {
  const userId = 'user-uuid-author-1';
  const otherUserId = 'user-uuid-other-2';
  const courseId = 'course-uuid-1';

  let service: PostsService;
  let mockPostsRepo: Mocked<PostsRepository>;
  let mockCoursesClient: Mocked<CoursesClient>;
  let mockModerationClient: Mocked<ModerationClient>;
  let mockGroupMessagingClient: Mocked<GroupMessagingClient>;
  let studyGroupCreator: StudyGroupPostCreator;
  let tutoringCreator: TutoringPostCreator;
  let postCreatorFactory: PostCreatorFactory;

  beforeEach(() => {
    mockPostsRepo = {
      create: vi.fn(),
      getPosts: vi.fn(),
      getPostById: vi.fn(),
      getPostsByUser: vi.fn(),
      searchByFilter: vi.fn(),
      edit: vi.fn(),
      delete: vi.fn(),
      findGroupById: vi.fn(),
    } as unknown as Mocked<PostsRepository>;

    mockCoursesClient = {
      findById: vi.fn(),
    } as unknown as Mocked<CoursesClient>;

    mockModerationClient = {
      publicationCreated: vi.fn(),
    } as unknown as Mocked<ModerationClient>;

    mockGroupMessagingClient = {
      findActiveById: vi.fn(),
      createAutoGroup: vi.fn(),
    } as unknown as Mocked<GroupMessagingClient>;

    studyGroupCreator = new StudyGroupPostCreator(mockGroupMessagingClient);
    tutoringCreator = new TutoringPostCreator(mockGroupMessagingClient);
    postCreatorFactory = new PostCreatorFactory([studyGroupCreator, tutoringCreator]);

    service = new PostsServiceImpl(
      mockPostsRepo,
      mockCoursesClient,
      mockModerationClient,
      postCreatorFactory,
    );
  });

  describe('Factory Method: PostCreator & PostCreatorFactory', () => {
    const course: CourseData = {
      id: courseId,
      name: 'Ingeniería de Software I',
      cycle: 7,
    };

    it('debe auto-crear grupo para study_group cuando no se proporciona groupId', async () => {
      mockGroupMessagingClient.createAutoGroup.mockResolvedValue('new-auto-group-uuid');

      const entity = await studyGroupCreator.create(
        {
          courseId,
          type: 'study_group',
          description: 'Grupo para parcial',
          benefits: 'Resúmenes',
          requirements: 'Puntualidad',
        },
        userId,
        course,
      );

      expect(entity.type).toBe('study_group');
      expect(entity.groupId).toBe('new-auto-group-uuid');
      expect(mockGroupMessagingClient.createAutoGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Grupo de Ingeniería de Software I',
          benefits: 'Resúmenes',
        }),
        userId,
      );
    });

    it('debe vincular a grupo existente para study_group si se especifica groupId', async () => {
      mockGroupMessagingClient.findActiveById.mockResolvedValue({ id: 'existing-group-uuid' });

      const entity = await studyGroupCreator.create(
        {
          courseId,
          groupId: 'existing-group-uuid',
          type: 'study_group',
          description: 'Grupo existente',
        },
        userId,
        course,
      );

      expect(entity.groupId).toBe('existing-group-uuid');
      expect(mockGroupMessagingClient.createAutoGroup).not.toHaveBeenCalled();
    });

    it('debe lanzar NotFoundException si el groupId especificado no existe en study_group', async () => {
      mockGroupMessagingClient.findActiveById.mockResolvedValue(null);

      await expect(
        studyGroupCreator.create(
          {
            courseId,
            groupId: 'invalid-group-uuid',
            type: 'study_group',
            description: 'Grupo inválido',
          },
          userId,
          course,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('no debe auto-crear grupo para tutoring cuando groupId es omitido', async () => {
      const entity = await tutoringCreator.create(
        {
          courseId,
          type: 'tutoring',
          description: 'Ofrezco tutoría',
        },
        userId,
        course,
      );

      expect(entity.type).toBe('tutoring');
      expect(entity.groupId).toBeNull();
      expect(mockGroupMessagingClient.createAutoGroup).not.toHaveBeenCalled();
    });

    it('debe lanzar UnprocessableEntityException si se solicita un tipo no soportado', () => {
      expect(() => postCreatorFactory.getCreator('invalid_type')).toThrow(
        UnprocessableEntityException,
      );
    });

    it('debe permitir extender nuevos tipos de publicación dinámicamente sin modificar código (Open/Closed Principle)', () => {
      const mockCustomCreator = {
        type: 'workshop',
        create: vi.fn(),
      } as unknown as StudyGroupPostCreator;

      const dynamicFactory = new PostCreatorFactory([
        studyGroupCreator,
        tutoringCreator,
        mockCustomCreator,
      ]);

      expect(dynamicFactory.getCreator('workshop')).toBe(mockCustomCreator);
      expect(dynamicFactory.getCreator('study_group')).toBe(studyGroupCreator);
      expect(dynamicFactory.getCreator('tutoring')).toBe(tutoringCreator);
    });
  });

  describe('PostsService.createPost (con Adapter y Factory)', () => {
    it('debe crear un post delegando en Factory, Repository y notificar a ModerationClient (Happy Path)', async () => {
      const course: CourseData = {
        id: courseId,
        name: 'Ingeniería de Software I',
        cycle: 7,
      };
      mockCoursesClient.findById.mockResolvedValue(course);
      mockGroupMessagingClient.createAutoGroup.mockResolvedValue('group-123');

      const fakeSavedPost: Partial<PostEntity> = {
        id: 'post-123',
        userId,
        courseId,
        type: 'study_group',
        description: 'Grupo de estudio para repasar parcial',
        benefits: 'Material resuelto',
        requirements: 'Puntualidad',
        maxCapacity: 5,
        groupId: 'group-123',
        status: 'published',
        createdAt: new Date(),
        updatedAt: new Date(),
        profile: {
          name: 'Autor Juan',
          profilePhotoUrl: null,
        } as any,
        course: course as any,
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
      expect(mockPostsRepo.create).toHaveBeenCalled();
      expect(mockModerationClient.publicationCreated).toHaveBeenCalledWith(fakeSavedPost);
    });

    it('debe lanzar UnprocessableEntityException si el curso no existe vía CoursesClient', async () => {
      mockCoursesClient.findById.mockResolvedValue(null);

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

  describe('PostsService.getPostById', () => {
    it('debe retornar el post mapeado si existe', async () => {
      const mockPost: Partial<PostEntity> = {
        id: 'post-1',
        userId,
        courseId: 'course-1',
        type: POST_TYPES.STUDY_GROUP,
        description: 'Post de prueba',
        status: 'published',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPostsRepo.getPostById.mockResolvedValue(mockPost as PostEntity);

      const result = await service.getPostById('post-1');
      expect(result.id).toBe('post-1');
      expect(result.description).toBe('Post de prueba');
    });

    it('debe lanzar NotFoundException si el post no existe', async () => {
      mockPostsRepo.getPostById.mockResolvedValue(null);

      await expect(service.getPostById('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('PostsService.editPost', () => {
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

  describe('PostsService.deletePost', () => {
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

  describe('PostsService.listPostsByUser', () => {
    it('debe retornar publicaciones con la información del autor para el historial propio', async () => {
      const mockPost: Partial<PostEntity> = {
        id: 'post-1',
        userId,
        courseId,
        type: POST_TYPES.STUDY_GROUP,
        description: 'Mi publicación de prueba',
        status: 'published',
        createdAt: new Date(),
        updatedAt: new Date(),
        profile: {
          name: 'Martín Vizcarra',
          profilePhotoUrl: 'https://avatar.test/martin.png',
        } as any,
        course: {
          id: courseId,
          name: 'Ingeniería de Software I',
          cycle: 7,
        } as any,
      };

      mockPostsRepo.getPostsByUser.mockResolvedValue({
        items: [mockPost as PostEntity],
        total: 1,
      });

      const result = await service.listPostsByUser(userId, 10, 0);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('post-1');
      expect(result[0].userId).toBe(userId);
      expect(result[0].author).toBeDefined();
      expect(result[0].author?.name).toBe('Martín Vizcarra');
      expect(result[0].author?.profilePhotoUrl).toBe('https://avatar.test/martin.png');
    });
  });

  describe('PostFilterQueryDto (Validation Tests)', () => {
    it('debe aceptar ciclo 11 para filtrar cursos electivos sin error de validación', async () => {
      const dto = plainToInstance(PostFilterQueryDto, { cycle: '11' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.cycle).toBe(11);
    });

    it('debe rechazar ciclos mayores a 11', async () => {
      const dto = plainToInstance(PostFilterQueryDto, { cycle: '12' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.max).toBeDefined();
    });
  });
});
