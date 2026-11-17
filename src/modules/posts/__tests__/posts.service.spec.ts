import { BadRequestException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { type Mocked } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PostException } from '../exception/PostException';
import { PostFilterQueryDto } from '../dto/post-query.dto';
import { PostUpdateDto } from '../dto/post-update.dto';
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
import { POST_MESSAGES, POST_TYPES } from '../posts.constants';

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
      mockGroupMessagingClient,
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
          courseCode: 'ING. DE SOFTWARE I',
        }),
        userId,
      );
    });

    it('debe vincular a grupo existente para study_group si se especifica groupId y sincronizar maxCapacity', async () => {
      mockGroupMessagingClient.findActiveById.mockResolvedValue({
        id: 'existing-group-uuid',
        leaderId: userId,
        groupType: 'study_group',
        maxCapacity: 4,
        isMember: true,
      });

      const entity = await studyGroupCreator.create(
        {
          courseId,
          groupId: 'existing-group-uuid',
          type: 'study_group',
          description: 'Grupo existente',
          maxCapacity: 8,
        },
        userId,
        course,
      );

      expect(entity.groupId).toBe('existing-group-uuid');
      expect(entity.maxCapacity).toBe(4);
      expect(mockGroupMessagingClient.createAutoGroup).not.toHaveBeenCalled();
    });

    it('debe lanzar PostException 404 si el groupId especificado no existe en study_group', async () => {
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
      ).rejects.toThrow(
        new PostException(POST_MESSAGES.GROUP_NOT_FOUND, HttpStatus.NOT_FOUND),
      );
    });

    it('debe lanzar PostException 400 si el groupId especificado no es de tipo study_group', async () => {
      mockGroupMessagingClient.findActiveById.mockResolvedValue({
        id: 'tutoring-group-uuid',
        leaderId: userId,
        groupType: 'tutoring',
        maxCapacity: 2,
        isMember: true,
      });

      await expect(
        studyGroupCreator.create(
          {
            courseId,
            groupId: 'tutoring-group-uuid',
            type: 'study_group',
            description: 'Grupo de tipo inválido',
          },
          userId,
          course,
        ),
      ).rejects.toThrow(
        new PostException(POST_MESSAGES.GROUP_INVALID_TYPE, HttpStatus.BAD_REQUEST),
      );
    });

    it('debe lanzar PostException 403 si el usuario no es miembro del groupId especificado', async () => {
      mockGroupMessagingClient.findActiveById.mockResolvedValue({
        id: 'foreign-group-uuid',
        leaderId: otherUserId,
        groupType: 'study_group',
        maxCapacity: 6,
        isMember: false,
      });

      await expect(
        studyGroupCreator.create(
          {
            courseId,
            groupId: 'foreign-group-uuid',
            type: 'study_group',
            description: 'Grupo ajeno',
          },
          userId,
          course,
        ),
      ).rejects.toThrow(
        new PostException(POST_MESSAGES.FORBIDDEN_GROUP_LINK, HttpStatus.FORBIDDEN),
      );
    });

    it('debe usar courseCode directo en mayúsculas cuando el nombre del curso tiene <= 20 caracteres', async () => {
      mockGroupMessagingClient.createAutoGroup.mockResolvedValue('short-course-group');
      const shortCourse: CourseData = { id: courseId, name: 'Cálculo I', cycle: 2 };

      const entity = await studyGroupCreator.create(
        { courseId, type: 'study_group', description: 'Repaso breve' },
        userId,
        shortCourse,
      );

      expect(entity.groupId).toBe('short-course-group');
      expect(mockGroupMessagingClient.createAutoGroup).toHaveBeenCalledWith(
        expect.objectContaining({ courseCode: 'CÁLCULO I' }),
        userId,
      );
    });

    it('debe validar membresía por leaderId en validateLinkedStudyGroup cuando isMember es undefined', async () => {
      mockGroupMessagingClient.findActiveById.mockResolvedValue({
        id: 'leader-other-uuid',
        leaderId: otherUserId,
        groupType: 'study_group',
      });

      await expect(
        studyGroupCreator.create(
          {
            courseId,
            groupId: 'leader-other-uuid',
            type: 'study_group',
            description: 'Grupo de otro líder',
          },
          userId,
          course,
        ),
      ).rejects.toThrow(
        new PostException(POST_MESSAGES.FORBIDDEN_GROUP_LINK, HttpStatus.FORBIDDEN),
      );

      mockGroupMessagingClient.findActiveById.mockResolvedValue({
        id: 'leader-own-uuid',
        leaderId: userId,
        groupType: 'study_group',
      });

      const ownLinked = await studyGroupCreator.create(
        {
          courseId,
          groupId: 'leader-own-uuid',
          type: 'study_group',
          description: 'Grupo propio por leaderId',
        },
        userId,
        course,
      );
      expect(ownLinked.groupId).toBe('leader-own-uuid');

      mockGroupMessagingClient.findActiveById.mockResolvedValue({ id: 'minimal-group-uuid' });
      const minimalLinked = await studyGroupCreator.create(
        {
          courseId,
          groupId: 'minimal-group-uuid',
          type: 'study_group',
          description: 'Grupo mínimo',
        },
        userId,
        course,
      );
      expect(minimalLinked.groupId).toBe('minimal-group-uuid');
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

    it('debe lanzar PostException 400 en tutoring si se intenta vincular un groupId', async () => {
      await expect(
        tutoringCreator.create(
          {
            courseId,
            groupId: 'some-group-uuid',
            type: 'tutoring',
            description: 'Tutoría con grupo inválido',
          },
          userId,
          course,
        ),
      ).rejects.toThrow(
        new PostException(POST_MESSAGES.TUTORING_NO_GROUP, HttpStatus.BAD_REQUEST),
      );
    });

    it('debe lanzar PostException 422 si se solicita un tipo no soportado', () => {
      expect(() => postCreatorFactory.getCreator('invalid_type')).toThrow(
        new PostException(POST_MESSAGES.UNSUPPORTED_TYPE, HttpStatus.UNPROCESSABLE_ENTITY),
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

  describe('PostsService.createPost (Unitarias HU 1.1)', () => {
    const course: CourseData = {
      id: courseId,
      name: 'Ingeniería de Software I',
      cycle: 7,
    };

    // Prueba Unitaria 1 (Happy Path con Stub, Mock y Spy de observación): verifica delegación en Factory, persistencia y moderación
    it('debe crear un post delegando en Factory, Repository y notificar a ModerationClient (Happy Path)', async () => {
      mockCoursesClient.findById.mockResolvedValue(course);
      mockGroupMessagingClient.createAutoGroup.mockResolvedValue('group-123');
      const getCreatorSpy = vi.spyOn(postCreatorFactory, 'getCreator');
      const studyCreateSpy = vi.spyOn(studyGroupCreator, 'create');

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
        } as unknown as PostEntity['profile'],
        course: course as unknown as PostEntity['course'],
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
      expect(getCreatorSpy).toHaveBeenCalledWith('study_group');
      expect(studyCreateSpy).toHaveBeenCalledTimes(1);
      expect(mockPostsRepo.create).toHaveBeenCalledTimes(1);
      expect(mockModerationClient.publicationCreated).toHaveBeenCalledWith(fakeSavedPost);
      getCreatorSpy.mockRestore();
      studyCreateSpy.mockRestore();
    });

    // Prueba Unitaria 2 (Spy con reemplazo puntual): aísla PostsServiceImpl interceptando temporalmente TutoringPostCreator.create
    it('debe usar Spy con reemplazo puntual (mockResolvedValueOnce) para aislar PostsServiceImpl de PostCreator concreto', async () => {
      mockCoursesClient.findById.mockResolvedValue(course);
      const stubbedEntity = {
        id: 'post-spy-override',
        userId,
        courseId,
        type: 'tutoring',
        description: 'Entidad controlada por Spy',
        benefits: null,
        requirements: null,
        maxCapacity: 3,
        groupId: null,
        status: 'published',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as PostEntity;

      const tutoringSpy = vi
        .spyOn(tutoringCreator, 'create')
        .mockResolvedValueOnce(stubbedEntity);
      mockPostsRepo.create.mockResolvedValue(stubbedEntity);

      const result = await service.createPost(
        {
          courseId,
          type: 'tutoring',
          description: 'Tutoría aislada con Spy',
          maxCapacity: 3,
        },
        userId,
      );

      expect(tutoringSpy).toHaveBeenCalledTimes(1);
      expect(mockPostsRepo.create).toHaveBeenCalledWith(stubbedEntity);
      expect(result.id).toBe('post-spy-override');
      expect(result.maxCapacity).toBe(3);
      tutoringSpy.mockRestore();
    });

    // Prueba Unitaria 3 (Stub de respuesta nula + Mock de no-invocación): curso inexistente lanza UnprocessableEntityException
    it('debe lanzar UnprocessableEntityException si el curso no existe vía CoursesClient (Stub)', async () => {
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
      ).rejects.toThrow(PostException);
      expect(mockPostsRepo.create).not.toHaveBeenCalled();
      expect(mockModerationClient.publicationCreated).not.toHaveBeenCalled();
    });

    // Prueba Unitaria 4 (Mock de excepción en repositorio): si falla la persistencia no se notifica a ModerationClient
    it('no debe notificar a ModerationClient si el repositorio lanza error de persistencia (Mock de fallo)', async () => {
      mockCoursesClient.findById.mockResolvedValue(course);
      mockGroupMessagingClient.createAutoGroup.mockResolvedValue('auto-group-id');
      mockPostsRepo.create.mockRejectedValue(new Error('DB connection error'));

      await expect(
        service.createPost(
          {
            courseId,
            type: 'study_group',
            description: 'Fallo simulado de BD',
          },
          userId,
        ),
      ).rejects.toThrow('DB connection error');
      expect(mockModerationClient.publicationCreated).not.toHaveBeenCalled();
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

    it('debe lanzar PostException 404 si el post no existe', async () => {
      mockPostsRepo.getPostById.mockResolvedValue(null);

      await expect(service.getPostById('inexistente')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('PostsService.editPost', () => {
    it('debe lanzar PostException 404 si el post a editar no existe', async () => {
      mockPostsRepo.getPostById.mockResolvedValue(null);

      await expect(
        service.editPost('post-inexistente', { description: 'Nueva desc' }, userId),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('debe lanzar PostException 403 (BOLA / IDOR) si el post pertenece a otro usuario', async () => {
      const otherPost: Partial<PostEntity> = {
        id: 'post-of-other',
        userId: otherUserId,
      };
      mockPostsRepo.getPostById.mockResolvedValue(otherPost as PostEntity);

      await expect(
        service.editPost('post-of-other', { description: 'Hack desc' }, userId),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('debe rechazar con 403 Forbidden si un usuario con rol admin intenta editar un post ajeno', async () => {
      const otherPost: Partial<PostEntity> = {
        id: 'post-of-other',
        userId: otherUserId,
        courseId,
        type: POST_TYPES.TUTORING,
        description: 'Original',
        status: 'published',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPostsRepo.getPostById.mockResolvedValue(otherPost as PostEntity);

      await expect(
        service.editPost(
          'post-of-other',
          { description: 'Editado por admin' },
          userId,
          'admin',
        ),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('debe rechazar cualquier intento de cambiar courseId o type en PostUpdateDto vía ValidationPipe', async () => {
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
      await expect(
        pipe.transform({ courseId: '8c537243-ea7d-411a-8bb7-fce5230bfdf2' }, { type: 'body', metatype: PostUpdateDto }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        pipe.transform({ type: 'tutoring' }, { type: 'body', metatype: PostUpdateDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar PostException 404 si se intenta vincular un groupId inexistente al editar', async () => {
      const myPost: Partial<PostEntity> = {
        id: 'post-1',
        userId,
        courseId,
        type: POST_TYPES.STUDY_GROUP,
      };
      mockPostsRepo.getPostById.mockResolvedValue(myPost as PostEntity);
      mockGroupMessagingClient.findActiveById.mockResolvedValue(null);

      await expect(
        service.editPost('post-1', { groupId: 'grupo-inexistente' }, userId),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(mockPostsRepo.edit).not.toHaveBeenCalled();
    });

    it('debe validar PostUpdateDto rechazando descripción con solo espacios en blanco', async () => {
      const dto = plainToInstance(PostUpdateDto, { description: '   ' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('PostsService.deletePost', () => {
    it('debe lanzar PostException 403 (BOLA / IDOR) si se intenta borrar un post ajeno', async () => {
      const otherPost: Partial<PostEntity> = {
        id: 'post-of-other',
        userId: otherUserId,
      };
      mockPostsRepo.getPostById.mockResolvedValue(otherPost as PostEntity);

      await expect(
        service.deletePost('post-of-other', userId),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
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
      expect(errors[0].constraints?.isBoundedInt).toBe('cycle no puede superar 11');
    });
  });
});
