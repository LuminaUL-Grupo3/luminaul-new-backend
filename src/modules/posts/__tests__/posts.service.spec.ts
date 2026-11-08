import { NotFoundException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { PostsService } from '../posts.service';
import { PostsRepository } from '../posts.repository';
import { CoursesClient, CourseData } from '../client/CoursesClient';
import { ModerationClient } from '../client/ModerationClient';
import { GroupMessagingClient } from '../client/GroupMessagingClient';
import { PostCreatorFactory } from '../factory/PostCreatorFactory';
import { StudyGroupPostCreator } from '../factory/impl/StudyGroupPostCreator';
import { TutoringPostCreator } from '../factory/impl/TutoringPostCreator';
import { PostEntity } from '../entities/post.entity';

describe('PostsModule Patterns (Unit Tests)', () => {
  const userId = 'user-uuid-author-1';
  const otherUserId = 'user-uuid-other-2';
  const courseId = 'course-uuid-1';

  let service: PostsService;
  let mockPostsRepo: jest.Mocked<PostsRepository>;
  let mockCoursesClient: jest.Mocked<CoursesClient>;
  let mockModerationClient: jest.Mocked<ModerationClient>;
  let mockGroupMessagingClient: jest.Mocked<GroupMessagingClient>;
  let studyGroupCreator: StudyGroupPostCreator;
  let tutoringCreator: TutoringPostCreator;
  let postCreatorFactory: PostCreatorFactory;

  beforeEach(() => {
    mockPostsRepo = {
      save: jest.fn(),
      create: jest.fn(),
      getPosts: jest.fn(),
      getPostById: jest.fn(),
      getPostsByUser: jest.fn(),
      searchByFilter: jest.fn(),
      edit: jest.fn(),
      delete: jest.fn(),
      findGroupById: jest.fn(),
    } as unknown as jest.Mocked<PostsRepository>;

    mockCoursesClient = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<CoursesClient>;

    mockModerationClient = {
      publicationCreated: jest.fn(),
    } as unknown as jest.Mocked<ModerationClient>;

    mockGroupMessagingClient = {
      findActiveById: jest.fn(),
      createAutoGroup: jest.fn(),
    } as unknown as jest.Mocked<GroupMessagingClient>;

    studyGroupCreator = new StudyGroupPostCreator(mockGroupMessagingClient);
    tutoringCreator = new TutoringPostCreator(mockGroupMessagingClient);
    postCreatorFactory = new PostCreatorFactory(studyGroupCreator, tutoringCreator);

    service = new PostsService(
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

      mockPostsRepo.save.mockResolvedValue(fakeSavedPost as PostEntity);

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
      expect(mockPostsRepo.save).toHaveBeenCalled();
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
});
