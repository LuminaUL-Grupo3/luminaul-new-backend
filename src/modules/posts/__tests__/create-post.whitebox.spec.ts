import { HttpStatus } from '@nestjs/common';
import { type Mocked } from 'vitest';
import { PostException } from '../exception/PostException';
import { PostsServiceImpl } from '../service/impl/PostsServiceImpl';
import { PostsRepository } from '../repository/PostsRepository';
import { CoursesClient, CourseData } from '../client/CoursesClient';
import { ModerationClient } from '../client/ModerationClient';
import { GroupMessagingClient } from '../client/GroupMessagingClient';
import { PostCreatorFactory } from '../factory/PostCreatorFactory';
import { StudyGroupPostCreator } from '../factory/impl/StudyGroupPostCreator';
import { TutoringPostCreator } from '../factory/impl/TutoringPostCreator';
import { PostCreateDto } from '../dto/post-create.dto';
import { PostEntity } from '../entities/post.entity';
import { POST_MESSAGES, POST_TYPES } from '../posts.constants';

// Prueba de caja blanca de PostsServiceImpl.createPost (V(G) = 7 > 4).
//
// Decisiones atómicas del método:
//   D1a  !postDto.description
//   D1b  postDto.description.trim().length === 0   (solo si D1a es falsa)
//   D2a  postDto.maxCapacity !== undefined
//   D2b  postDto.maxCapacity < 2                   (solo si D2a es verdadera)
//   D2c  postDto.maxCapacity > 8                   (solo si D2a es verdadera y D2b es falsa)
//   D3   !course
//
// Caminos básicos independientes (100 % de cobertura de ramas y condiciones de createPost):
//   C1  D1a V                                            -> 400 description cannot be empty
//   C2  D1a F, D1b V                                     -> 400 description cannot be empty
//   C3  D1a F, D1b F, D2a V, D2b V                       -> 400 maxCapacity must be between 2 and 8
//   C4  D1a F, D1b F, D2a V, D2b F, D2c V                -> 400 maxCapacity must be between 2 and 8
//   C5  D1a F, D1b F, D2a F, D3 V                        -> 422 Course not found
//   C6  D1a F, D1b F, D2a V, D2b F, D2c F, D3 F          -> 201 Post creado, persistido y notificado
//   C7  D1a F, D1b F, D2a F, D3 F                        -> 201 Post creado sin maxCapacity explícito (valor por defecto)
describe('HU 1.1 PostsServiceImpl.createPost (Caja Blanca · V(G) = 7 > 4)', () => {
  const authorId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
  const courseId = '8c537243-ea7d-411a-8bb7-fce5230bfdf2';
  const courseFixture: CourseData = {
    id: courseId,
    name: 'Ingeniería de Software II',
    cycle: 7,
  };

  let service: PostsServiceImpl;
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Prueba de Caja Blanca C1 (Camino independiente 1 - D1a=V): descripción vacía rechazada en la primera guarda
  it('C1 · D1a verdadera: corta cuando description está vacía sin llamar al catálogo ni factory', async () => {
    const getCreatorSpy = vi.spyOn(postCreatorFactory, 'getCreator');
    const dto: PostCreateDto = {
      courseId,
      type: POST_TYPES.STUDY_GROUP,
      description: '',
    };

    await expect(service.createPost(dto, authorId)).rejects.toThrow(
      new PostException(POST_MESSAGES.EMPTY_DESCRIPTION, HttpStatus.BAD_REQUEST),
    );
    expect(mockCoursesClient.findById).not.toHaveBeenCalled();
    expect(getCreatorSpy).not.toHaveBeenCalled();
    expect(mockPostsRepo.create).not.toHaveBeenCalled();
  });

  // Prueba de Caja Blanca C2 (Camino independiente 2 - D1a=F, D1b=V): descripción con solo espacios en blanco
  it('C2 · D1a falsa, D1b verdadera: corta cuando description contiene solo espacios en blanco', async () => {
    const getCreatorSpy = vi.spyOn(postCreatorFactory, 'getCreator');
    const dto: PostCreateDto = {
      courseId,
      type: POST_TYPES.STUDY_GROUP,
      description: '     \t  ',
    };

    await expect(service.createPost(dto, authorId)).rejects.toThrow(
      new PostException(POST_MESSAGES.EMPTY_DESCRIPTION, HttpStatus.BAD_REQUEST),
    );
    expect(mockCoursesClient.findById).not.toHaveBeenCalled();
    expect(getCreatorSpy).not.toHaveBeenCalled();
  });

  // Prueba de Caja Blanca C3 (Camino independiente 3 - D2a=V, D2b=V): maxCapacity por debajo del mínimo (< 2)
  it('C3 · D2a verdadera, D2b verdadera: corta cuando maxCapacity es menor a 2 (valor 1)', async () => {
    const getCreatorSpy = vi.spyOn(postCreatorFactory, 'getCreator');
    const dto: PostCreateDto = {
      courseId,
      type: POST_TYPES.STUDY_GROUP,
      description: 'Repaso para examen parcial',
      maxCapacity: 1,
    };

    await expect(service.createPost(dto, authorId)).rejects.toThrow(
      new PostException(POST_MESSAGES.INVALID_MAX_CAPACITY, HttpStatus.BAD_REQUEST),
    );
    expect(mockCoursesClient.findById).not.toHaveBeenCalled();
    expect(getCreatorSpy).not.toHaveBeenCalled();
  });

  // Prueba de Caja Blanca C4 (Camino independiente 4 - D2a=V, D2b=F, D2c=V): maxCapacity excede el máximo (> 8)
  it('C4 · D2a verdadera, D2b falsa, D2c verdadera: corta cuando maxCapacity supera 8 (valor 9)', async () => {
    const dto: PostCreateDto = {
      courseId,
      type: POST_TYPES.STUDY_GROUP,
      description: 'Grupo de estudio de patrones',
      maxCapacity: 9,
    };

    await expect(service.createPost(dto, authorId)).rejects.toThrow(
      new PostException(POST_MESSAGES.INVALID_MAX_CAPACITY, HttpStatus.BAD_REQUEST),
    );
    expect(mockCoursesClient.findById).not.toHaveBeenCalled();
    expect(mockPostsRepo.create).not.toHaveBeenCalled();
  });

  // Prueba de Caja Blanca C5 (Camino independiente 5 - D2a=F, D3=V): curso inexistente en catálogo
  it('C5 · D2a falsa, D3 verdadera: lanza PostException 422 cuando el curso no existe', async () => {
    mockCoursesClient.findById.mockResolvedValue(null);
    const getCreatorSpy = vi.spyOn(postCreatorFactory, 'getCreator');
    const dto: PostCreateDto = {
      courseId,
      type: POST_TYPES.STUDY_GROUP,
      description: 'Busco compañeros para proyecto',
    };

    await expect(service.createPost(dto, authorId)).rejects.toThrow(
      new PostException(POST_MESSAGES.COURSE_NOT_FOUND, HttpStatus.UNPROCESSABLE_ENTITY),
    );
    expect(mockCoursesClient.findById).toHaveBeenCalledWith(courseId);
    expect(getCreatorSpy).not.toHaveBeenCalled();
    expect(mockPostsRepo.create).not.toHaveBeenCalled();
  });

  // Prueba de Caja Blanca C6 (Camino independiente 6 - Todas las guardas falsas): flujo completo de creación
  it('C6 · Todas las guardas falsas (camino completo): crea post, persiste, notifica moderación y retorna DTO', async () => {
    const generatedGroupId = 'auto-group-uuid-001';
    mockCoursesClient.findById.mockResolvedValue(courseFixture);
    mockGroupMessagingClient.createAutoGroup.mockResolvedValue(generatedGroupId);
    mockPostsRepo.create.mockImplementation(async (entity: PostEntity) => entity);

    const getCreatorSpy = vi.spyOn(postCreatorFactory, 'getCreator');
    const studyCreatorSpy = vi.spyOn(studyGroupCreator, 'create');

    const dto: PostCreateDto = {
      courseId,
      type: POST_TYPES.STUDY_GROUP,
      description: 'Grupo para laboratorio de pruebas',
      benefits: 'Solucionarios',
      requirements: 'Conocimientos de TypeScript',
      maxCapacity: 8,
    };

    const result = await service.createPost(dto, authorId);

    expect(getCreatorSpy).toHaveBeenCalledWith(POST_TYPES.STUDY_GROUP);
    expect(studyCreatorSpy).toHaveBeenCalledWith(dto, authorId, courseFixture);
    expect(mockPostsRepo.create).toHaveBeenCalledTimes(1);
    expect(mockModerationClient.publicationCreated).toHaveBeenCalledTimes(1);
    expect(result.groupId).toBe(generatedGroupId);
    expect(result.maxCapacity).toBe(8);
  });

  // Prueba de Caja Blanca C7 (Camino independiente 7 - D1a=F, D1b=F, D2a=F, D3=F): maxCapacity omitido con curso válido
  it('C7 · D2a falsa, D3 falsa: crea post correctamente cuando maxCapacity no se envía', async () => {
    mockCoursesClient.findById.mockResolvedValue(courseFixture);
    mockPostsRepo.create.mockImplementation(async (entity: PostEntity) => ({
      ...entity,
      maxCapacity: 5,
    }));

    const dto: PostCreateDto = {
      courseId,
      type: POST_TYPES.TUTORING,
      description: 'Asesoría de algoritmos',
    };

    const result = await service.createPost(dto, authorId);

    expect(mockCoursesClient.findById).toHaveBeenCalledWith(courseId);
    expect(mockPostsRepo.create).toHaveBeenCalledTimes(1);
    expect(mockModerationClient.publicationCreated).toHaveBeenCalledTimes(1);
    expect(result.maxCapacity).toBe(5);
  });

  // Ramas internas de validateLinkedStudyGroup vía StudyGroupPostCreator
  it('CB-G1 · groupType distinto a study_group: lanza PostException 400 y no persiste', async () => {
    mockCoursesClient.findById.mockResolvedValue(courseFixture);
    mockGroupMessagingClient.findActiveById.mockResolvedValue({
      id: 'group-tutoring-1',
      leaderId: authorId,
      groupType: POST_TYPES.TUTORING,
      maxCapacity: 2,
      isMember: true,
    });

    const dto: PostCreateDto = {
      courseId,
      type: POST_TYPES.STUDY_GROUP,
      description: 'Intento con grupo de tutoría',
      groupId: 'group-tutoring-1',
    };

    await expect(service.createPost(dto, authorId)).rejects.toThrow(
      new PostException(POST_MESSAGES.GROUP_INVALID_TYPE, HttpStatus.BAD_REQUEST),
    );
    expect(mockPostsRepo.create).not.toHaveBeenCalled();
  });

  it('CB-G2 · usuario no miembro ni líder del grupo: lanza PostException 403 y no persiste', async () => {
    mockCoursesClient.findById.mockResolvedValue(courseFixture);
    mockGroupMessagingClient.findActiveById.mockResolvedValue({
      id: 'group-foreign-1',
      leaderId: 'other-user-uuid',
      groupType: POST_TYPES.STUDY_GROUP,
      maxCapacity: 6,
      isMember: false,
    });

    const dto: PostCreateDto = {
      courseId,
      type: POST_TYPES.STUDY_GROUP,
      description: 'Intento con grupo ajeno',
      groupId: 'group-foreign-1',
    };

    await expect(service.createPost(dto, authorId)).rejects.toThrow(
      new PostException(POST_MESSAGES.FORBIDDEN_GROUP_LINK, HttpStatus.FORBIDDEN),
    );
    expect(mockPostsRepo.create).not.toHaveBeenCalled();
  });
});
