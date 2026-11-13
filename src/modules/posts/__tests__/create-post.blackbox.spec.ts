import 'reflect-metadata';
import { randomUUID } from 'crypto';
import {
  INestApplication,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX, configureHttpApp } from '../../../config/http-app.config';
import { SessionService, ValidatedSession } from '../../auth-security/service/SessionService';
import { UserEntity } from '../../auth-security/entities/user.entity';
import { PostsController } from '../controller/PostsController';
import { PostsService } from '../service/PostsService';
import { PostsServiceImpl } from '../service/impl/PostsServiceImpl';
import { PostsRepository, PaginatedResult } from '../repository/PostsRepository';
import { CoursesClient, CourseData } from '../client/CoursesClient';
import { GroupMessagingClient, AutoGroupInput } from '../client/GroupMessagingClient';
import { ModerationClient } from '../client/ModerationClient';
import { PostCreatorFactory } from '../factory/PostCreatorFactory';
import { StudyGroupPostCreator } from '../factory/impl/StudyGroupPostCreator';
import { TutoringPostCreator } from '../factory/impl/TutoringPostCreator';
import { PostCreator } from '../factory/PostCreator';
import { PostEntity } from '../entities/post.entity';
import { PostUpdateDto } from '../dto/post-update.dto';
import { POST_CREATORS, POST_MESSAGES } from '../posts.constants';

/**
 * PRUEBAS DE CAJA NEGRA (CAP. 10.3) — HU 1.1: Agregar Publicaciones (POST /api/posts)
 *
 * Se diseña exclusivamente a partir del contrato público del endpoint:
 *   - Método / Ruta: POST /api/posts (autenticado vía Bearer JWT o cookie)
 *   - 7 Campos de entrada:
 *       1. courseId     (obligatorio, UUID de curso existente en catálogo)
 *       2. type         (obligatorio, 'study_group' | 'tutoring')
 *       3. description  (obligatorio, string no vacío ni solo espacios; se aplica trim)
 *       4. benefits     (opcional, string)
 *       5. requirements (opcional, string)
 *       6. groupId      (opcional, UUID de grupo activo existente)
 *       7. maxCapacity  (opcional, entero entre 1 y 50; por defecto 5)
 *   - Códigos de respuesta esperados:
 *       201 Created | 400 Bad Request | 401 Unauthorized | 404 Not Found | 422 Unprocessable Entity
 *
 * Técnicas aplicadas:
 *   - Particiones de Equivalencia (EV / EI) sobre los 7 campos de entrada
 *   - Análisis de Valores Límite (BV) sobre maxCapacity ([1, 50]) y description (longitud 0 vs 1)
 */

const GOLDEN_USER_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const GOLDEN_COURSE_ID = '8c537243-ea7d-411a-8bb7-fce5230bfdf2';
const GOLDEN_GROUP_ID = '7b134111-9a22-48df-9fa0-cd8213aa0981';
const VALID_TOKEN = 'valid-student-jwt-token';

class InMemoryPostsRepository extends PostsRepository {
  readonly saved: PostEntity[] = [];

  async findById(id: string): Promise<PostEntity | null> {
    return this.saved.find((p) => p.id === id) ?? null;
  }

  async findAll(): Promise<PostEntity[]> {
    return [...this.saved];
  }

  async insert(entity: Partial<PostEntity>): Promise<PostEntity> {
    const created = Object.assign(new PostEntity(), entity);
    this.saved.push(created);
    return created;
  }

  async update(entity: PostEntity): Promise<PostEntity> {
    const idx = this.saved.findIndex((p) => p.id === entity.id);
    if (idx >= 0) this.saved[idx] = entity;
    return entity;
  }

  async findGroupById(groupId: string): Promise<{ id: string } | null> {
    return groupId === GOLDEN_GROUP_ID ? { id: groupId } : null;
  }

  async create(post: PostEntity): Promise<PostEntity> {
    this.saved.push(post);
    return post;
  }

  async getPosts(limit: number, offset: number): Promise<PaginatedResult<PostEntity>> {
    return { items: this.saved.slice(offset, offset + limit), total: this.saved.length };
  }

  async getPostById(postId: string): Promise<PostEntity | null> {
    return this.findById(postId);
  }

  async getPostsByUser(userId: string, limit: number, offset: number): Promise<PaginatedResult<PostEntity>> {
    const filtered = this.saved.filter((p) => p.userId === userId);
    return { items: filtered.slice(offset, offset + limit), total: filtered.length };
  }

  async searchByFilter(limit: number, offset: number): Promise<PaginatedResult<PostEntity>> {
    return this.getPosts(limit, offset);
  }

  async edit(postId: string, postData: PostUpdateDto): Promise<PostEntity | null> {
    const post = await this.findById(postId);
    if (!post) return null;
    Object.assign(post, postData);
    return post;
  }

  async delete(postId: string): Promise<boolean> {
    const idx = this.saved.findIndex((p) => p.id === postId);
    if (idx < 0) return false;
    this.saved.splice(idx, 1);
    return true;
  }

  clear(): void {
    this.saved.length = 0;
  }
}

class InMemoryCoursesClient extends CoursesClient {
  private readonly courses = new Map<string, CourseData>([
    [
      GOLDEN_COURSE_ID,
      {
        id: GOLDEN_COURSE_ID,
        name: 'Ingeniería de Software I',
        cycle: 5,
      },
    ],
  ]);

  async findById(courseId: string): Promise<CourseData | null> {
    return this.courses.get(courseId) ?? null;
  }
}

class InMemoryGroupMessagingClient extends GroupMessagingClient {
  private readonly activeGroups = new Set<string>([GOLDEN_GROUP_ID]);
  readonly autoCreatedInputs: AutoGroupInput[] = [];

  async findActiveById(groupId: string): Promise<{ id: string } | null> {
    return this.activeGroups.has(groupId) ? { id: groupId } : null;
  }

  async createAutoGroup(input: AutoGroupInput): Promise<string> {
    this.autoCreatedInputs.push(input);
    const id = randomUUID();
    this.activeGroups.add(id);
    return id;
  }
}

class RecordingModerationClient extends ModerationClient {
  readonly notifiedPosts: PostEntity[] = [];

  publicationCreated(post: PostEntity): void {
    this.notifiedPosts.push(post);
  }
}

class StubSessionService extends SessionService {
  get ttlSeconds(): number {
    return 3600;
  }

  issueAccessToken(): string {
    return VALID_TOKEN;
  }

  async validate(token: string): Promise<ValidatedSession> {
    if (token !== VALID_TOKEN) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    const user = {
      id: GOLDEN_USER_ID,
      email: '20210001@aloe.ulima.edu.pe',
      role: 'student',
    } as UserEntity;

    return {
      payload: {
        sub: GOLDEN_USER_ID,
        email: '20210001@aloe.ulima.edu.pe',
        role: 'student',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      user,
    };
  }

  async revoke(): Promise<void> {
    return;
  }
}

const postsRepo = new InMemoryPostsRepository();
const coursesClient = new InMemoryCoursesClient();
const groupClient = new InMemoryGroupMessagingClient();
const moderationClient = new RecordingModerationClient();
const sessionService = new StubSessionService();

@Module({
  controllers: [PostsController],
  providers: [
    { provide: PostsRepository, useValue: postsRepo },
    { provide: CoursesClient, useValue: coursesClient },
    { provide: GroupMessagingClient, useValue: groupClient },
    { provide: ModerationClient, useValue: moderationClient },
    { provide: SessionService, useValue: sessionService },
    StudyGroupPostCreator,
    TutoringPostCreator,
    {
      provide: POST_CREATORS,
      useFactory: (
        studyGroup: StudyGroupPostCreator,
        tutoring: TutoringPostCreator,
      ): PostCreator[] => [studyGroup, tutoring],
      inject: [StudyGroupPostCreator, TutoringPostCreator],
    },
    PostCreatorFactory,
    { provide: PostsService, useClass: PostsServiceImpl },
  ],
})
class CreatePostBlackboxTestModule {}

interface BlackboxResponse {
  status: number;
  body: {
    id?: string;
    userId?: string;
    courseId?: string;
    type?: string;
    description?: string;
    benefits?: string | null;
    requirements?: string | null;
    groupId?: string | null;
    maxCapacity?: number;
    status?: string;
    statusCode?: number;
    message?: string | string[];
  };
}

describe('HU 1.1 Agregar Publicaciones · POST /api/posts (Pruebas de Caja Negra)', () => {
  let app: INestApplication;
  let baseUrl: string;

  async function postCreate(
    payload: Record<string, unknown>,
    token: string | null = VALID_TOKEN,
  ): Promise<BlackboxResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token !== null) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as BlackboxResponse['body'];
    return { status: res.status, body };
  }

  function extractMessages(body: BlackboxResponse['body']): string {
    if (Array.isArray(body.message)) return body.message.join(' | ');
    return String(body.message ?? '');
  }

  beforeAll(async () => {
    app = await NestFactory.create(CreatePostBlackboxTestModule, { logger: false });
    configureHttpApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/${API_PREFIX}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    postsRepo.clear();
    moderationClient.notifiedPosts.length = 0;
    groupClient.autoCreatedInputs.length = 0;
  });

  // Prueba de Caja Negra CN01 (Partición Válida - 7 campos completos): study_group sin groupId auto-crea el grupo
  it('CN01 [TD-R1 / EV]: crea publicación study_group con 7 campos válidos y sin groupId (auto-crea grupo)', async () => {
    const payload = {
      courseId: GOLDEN_COURSE_ID,
      type: 'study_group',
      description: 'Buscamos compañeros para el trabajo final',
      benefits: 'Banco de exámenes y guía resuelta',
      requirements: 'Compromiso horario nocturno',
      maxCapacity: 8,
    };

    const res = await postCreate(payload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.userId).toBe(GOLDEN_USER_ID);
    expect(res.body.courseId).toBe(GOLDEN_COURSE_ID);
    expect(res.body.type).toBe('study_group');
    expect(res.body.description).toBe(payload.description);
    expect(res.body.benefits).toBe(payload.benefits);
    expect(res.body.requirements).toBe(payload.requirements);
    expect(res.body.maxCapacity).toBe(8);
    expect(res.body.groupId).toBeTruthy();
    expect(res.body.status).toBe('published');
  });

  // Prueba de Caja Negra CN02 (Partición Válida - campo groupId existente): study_group vinculado a grupo activo
  it('CN02 [TD-R2 / EV]: crea publicación study_group vinculada a un groupId activo existente', async () => {
    const payload = {
      courseId: GOLDEN_COURSE_ID,
      type: 'study_group',
      description: 'Se abre cupo para grupo ya creado',
      groupId: GOLDEN_GROUP_ID,
      maxCapacity: 6,
    };

    const res = await postCreate(payload);

    expect(res.status).toBe(201);
    expect(res.body.groupId).toBe(GOLDEN_GROUP_ID);
    expect(groupClient.autoCreatedInputs).toHaveLength(0);
  });

  // Prueba de Caja Negra CN03 (Partición Válida - campos obligatorios): tutoring sin opcionales aplica defaults (groupId=null, maxCapacity=5)
  it('CN03 [TD-R4 / EV]: crea publicación tutoring solo con campos obligatorios aplicando defaults (groupId=null, maxCapacity=5)', async () => {
    const payload = {
      courseId: GOLDEN_COURSE_ID,
      type: 'tutoring',
      description: 'Ofrezco tutoría de diagramas de secuencia UML',
    };

    const res = await postCreate(payload);

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('tutoring');
    expect(res.body.groupId).toBeNull();
    expect(res.body.maxCapacity).toBe(5);
    expect(res.body.benefits).toBeNull();
    expect(res.body.requirements).toBeNull();
  });

  // Prueba de Caja Negra CN04 (Partición Inválida - campo courseId): formato distinto a UUID
  it('CN04 [EI-courseId]: rechaza con 400 cuando courseId no tiene formato UUID', async () => {
    const payload = {
      courseId: 'curso-no-uuid-123',
      type: 'study_group',
      description: 'Descripción válida',
    };

    const res = await postCreate(payload);

    expect(res.status).toBe(400);
    expect(extractMessages(res.body)).toContain('courseId must be a valid UUID');
  });

  // Prueba de Caja Negra CN05 (Partición Inválida - campo courseId): campo obligatorio omitido
  it('CN05 [EI-courseId]: rechaza con 400 cuando se omite courseId', async () => {
    const payload = {
      type: 'study_group',
      description: 'Publicación sin curso asignado',
    };

    const res = await postCreate(payload);

    expect(res.status).toBe(400);
    expect(extractMessages(res.body)).toContain('courseId must be a valid UUID');
  });

  // Prueba de Caja Negra CN06 (Partición Inválida - campo courseId): UUID válido pero inexistente en catálogo (422)
  it('CN06 [EI-courseId / TD-R5]: retorna 422 cuando courseId es UUID válido pero no existe en catálogo', async () => {
    const payload = {
      courseId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      type: 'study_group',
      description: 'Grupo para curso inexistente',
    };

    const res = await postCreate(payload);

    expect(res.status).toBe(422);
    expect(extractMessages(res.body)).toContain(POST_MESSAGES.COURSE_NOT_FOUND);
  });

  // Prueba de Caja Negra CN07 (Partición Inválida - campo type): valor fuera del enum permitido
  it('CN07 [EI-type]: rechaza con 400 cuando type no pertenece al enum (study_group | tutoring)', async () => {
    const payload = {
      courseId: GOLDEN_COURSE_ID,
      type: 'workshop',
      description: 'Taller no contemplado en el contrato',
    };

    const res = await postCreate(payload);

    expect(res.status).toBe(400);
    expect(extractMessages(res.body)).toContain('type must be tutoring or study_group');
  });

  // Prueba de Caja Negra CN08 (Partición Inválida / Valor Límite 0 - campo description): cadena vacía
  it('CN08 [EI-description / BV]: rechaza con 400 cuando description es cadena vacía ""', async () => {
    const payload = {
      courseId: GOLDEN_COURSE_ID,
      type: 'study_group',
      description: '',
    };

    const res = await postCreate(payload);

    expect(res.status).toBe(400);
    expect(extractMessages(res.body)).toContain('description cannot be empty');
  });

  // Prueba de Caja Negra CN09 (Partición Inválida - campo description): cadena compuesta solo por espacios en blanco
  it('CN09 [EI-description / BV]: rechaza con 400 cuando description solo contiene espacios en blanco', async () => {
    const payload = {
      courseId: GOLDEN_COURSE_ID,
      type: 'tutoring',
      description: '     ',
    };

    const res = await postCreate(payload);

    expect(res.status).toBe(400);
    expect(extractMessages(res.body)).toContain('description cannot be empty');
  });

  // Prueba de Caja Negra CN10 (Valor Límite 1 y Partición Válida - campo description): longitud mínima 1 y trim de espacios
  it('CN10 [EV-description / BV]: acepta longitud mínima 1 ("A") y recorta espacios laterales', async () => {
    const resMin = await postCreate({
      courseId: GOLDEN_COURSE_ID,
      type: 'tutoring',
      description: 'A',
    });
    const resTrim = await postCreate({
      courseId: GOLDEN_COURSE_ID,
      type: 'tutoring',
      description: '  Estudio grupal de patrones  ',
    });

    expect(resMin.status).toBe(201);
    expect(resMin.body.description).toBe('A');
    expect(resTrim.status).toBe(201);
    expect(resTrim.body.description).toBe('Estudio grupal de patrones');
  });

  // Prueba de Caja Negra CN11 (Partición Inválida - campos benefits y requirements): tipos distintos a string
  it('CN11 [EI-benefits / EI-requirements]: rechaza con 400 cuando benefits o requirements no son string', async () => {
    const payload = {
      courseId: GOLDEN_COURSE_ID,
      type: 'study_group',
      description: 'Descripción válida',
      benefits: ['lista', 'invalida'],
      requirements: ['arreglo', 'invalido'],
    };

    const res = await postCreate(payload);

    expect(res.status).toBe(400);
    const msg = extractMessages(res.body);
    expect(msg).toContain('benefits must be a string');
    expect(msg).toContain('requirements must be a string');
  });

  // Prueba de Caja Negra CN12 (Partición Inválida - campo groupId): formato distinto a UUID
  it('CN12 [EI-groupId]: rechaza con 400 cuando groupId tiene formato no UUID', async () => {
    const payload = {
      courseId: GOLDEN_COURSE_ID,
      type: 'study_group',
      description: 'Grupo con id mal formado',
      groupId: 'grupo-123',
    };

    const res = await postCreate(payload);

    expect(res.status).toBe(400);
    expect(extractMessages(res.body)).toContain('groupId must be a valid UUID');
  });

  // Prueba de Caja Negra CN13 (Partición Inválida - campo groupId): UUID válido de grupo inexistente o inactivo (404)
  it('CN13 [EI-groupId / TD-R3]: retorna 404 cuando groupId es UUID válido pero no existe o está inactivo', async () => {
    const payload = {
      courseId: GOLDEN_COURSE_ID,
      type: 'study_group',
      description: 'Vinculando a grupo eliminado',
      groupId: 'ffffffff-1111-4222-8333-444444444444',
    };

    const res = await postCreate(payload);

    expect(res.status).toBe(404);
    expect(extractMessages(res.body)).toContain(POST_MESSAGES.GROUP_NOT_FOUND);
  });

  // Prueba de Caja Negra CN14 (Valor Límite inferior - 1 - campo maxCapacity): valor 0 rechazado
  it('CN14 [BV maxCapacity = 0 (límite inferior - 1)]: rechaza con 400 Bad Request', async () => {
    const res = await postCreate({
      courseId: GOLDEN_COURSE_ID,
      type: 'study_group',
      description: 'Prueba valor límite inferior - 1',
      maxCapacity: 0,
    });

    expect(res.status).toBe(400);
    expect(extractMessages(res.body)).toContain('maxCapacity must not be less than 1');
  });

  // Prueba de Caja Negra CN15 (Valor Límite inferior exacto - campo maxCapacity): valor 1 aceptado
  it('CN15 [BV maxCapacity = 1 (límite inferior exacto)]: acepta con 201 Created', async () => {
    const res = await postCreate({
      courseId: GOLDEN_COURSE_ID,
      type: 'tutoring',
      description: 'Tutoría individual (límite mínimo 1)',
      maxCapacity: 1,
    });

    expect(res.status).toBe(201);
    expect(res.body.maxCapacity).toBe(1);
  });

  // Prueba de Caja Negra CN16 (Valor Límite inferior + 1 - campo maxCapacity): valor 2 aceptado
  it('CN16 [BV maxCapacity = 2 (límite inferior + 1)]: acepta con 201 Created', async () => {
    const res = await postCreate({
      courseId: GOLDEN_COURSE_ID,
      type: 'tutoring',
      description: 'Tutoría en pareja',
      maxCapacity: 2,
    });

    expect(res.status).toBe(201);
    expect(res.body.maxCapacity).toBe(2);
  });

  // Prueba de Caja Negra CN17 (Valor Límite superior exacto - campo maxCapacity): valor 50 aceptado
  it('CN17 [BV maxCapacity = 50 (límite superior exacto)]: acepta con 201 Created', async () => {
    const res = await postCreate({
      courseId: GOLDEN_COURSE_ID,
      type: 'study_group',
      description: 'Seminario grande (límite máximo 50)',
      maxCapacity: 50,
    });

    expect(res.status).toBe(201);
    expect(res.body.maxCapacity).toBe(50);
  });

  // Prueba de Caja Negra CN18 (Valor Límite superior + 1 - campo maxCapacity): valor 51 rechazado
  it('CN18 [BV maxCapacity = 51 (límite superior + 1)]: rechaza con 400 Bad Request', async () => {
    const res = await postCreate({
      courseId: GOLDEN_COURSE_ID,
      type: 'study_group',
      description: 'Capacidad excedida (51)',
      maxCapacity: 51,
    });

    expect(res.status).toBe(400);
    expect(extractMessages(res.body)).toContain('maxCapacity must not be greater than 50');
  });

  // Prueba de Caja Negra CN19 (Partición Inválida - campo maxCapacity): valor decimal no entero rechazado
  it('CN19 [EI maxCapacity = 3.5 (no entero)]: rechaza con 400 Bad Request', async () => {
    const res = await postCreate({
      courseId: GOLDEN_COURSE_ID,
      type: 'study_group',
      description: 'Capacidad decimal inválida',
      maxCapacity: 3.5,
    });

    expect(res.status).toBe(400);
    expect(extractMessages(res.body)).toContain('maxCapacity must be an integer number');
  });
});
