import 'reflect-metadata';
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX, configureHttpApp } from '../../../config/http-app.config';
import { SessionService } from '../../auth-security/service/SessionService';
import { ReviewsController } from '../controller/ReviewsController';
import { ReviewsService } from '../service/ReviewsService';
import { ReviewsServiceImpl } from '../service/impl/ReviewsServiceImpl';
import { ReviewsRepository } from '../repository/ReviewsRepository';
import { ModerationClient } from '../client/ModerationClient';
import { ProfileClient } from '../client/ProfileClient';
import { ReviewAuthorDto } from '../dto/ReviewResponseDto';
import { ReviewEntity } from '../entities/review.entity';
import { REVIEW_MESSAGES, REVIEW_STATUS } from '../reviews.constants';

// Prueba de caja negra (cap. 10.3) — HU 5.2 Ver reseñas en un perfil (GET /api/reviews/user/{userId}).
//
// Se diseña solo desde la especificación pública del endpoint, sin mirar el código:
//   - Entrada: userId en la ruta (único campo de entrada; el endpoint es público).
//   - 200 { userId, averageRating (1 decimal, 0 sin reseñas), totalReviews, reviews[] }.
//     Solo cuentan las reseñas publicadas: las ocultas por moderación o eliminadas no aparecen.
//   - 400 «El identificador de la ruta debe ser un UUID v4 válido» si userId no es un UUID v4.
// Técnicas: particiones de equivalencia (EV = válida, EI = inválida) y valores límite (BV) sobre la
// longitud del UUID (36 caracteres) y la calificación (1 y 5).
// La base de datos se reemplaza por un repositorio en memoria con el mismo contrato que
// ReviewsRepositoryImpl; los perfiles, por un ProfileClient en memoria.
//
// Nota: la HU tiene un solo campo de entrada (userId), por debajo de los más de 4 que pide la
// rúbrica; se cubren todas sus particiones y valores límite.

const WITH_REVIEWS = 'a1b2c3d4-e5f6-47a8-b9c0-123456789abc';
const WITHOUT_REVIEWS = 'b2c3d4e5-f6a7-48b9-8c0d-23456789abcd';
const ONLY_HIDDEN = 'c3d4e5f6-a7b8-49c0-9d1e-3456789abcde';
const UNKNOWN = 'e5f6a7b8-c9d0-4e1f-a2b3-56789abcdef0';
const AUTHOR = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

const stored: ReviewEntity[] = [];
let seq = 0;
function add(reviewedUserId: string, rating: number, status: string, deleted = false): void {
  seq += 1;
  stored.push({
    id: `99887766-5544-4322-8100-${String(seq).padStart(12, '0')}`,
    reviewerId: AUTHOR,
    reviewedUserId,
    rating,
    comment: `Reseña ${seq}`,
    status,
    createdAt: new Date(Date.UTC(2026, 9, seq)),
    updatedAt: new Date(Date.UTC(2026, 9, seq)),
    deletedAt: deleted ? new Date() : null,
  } as ReviewEntity);
}

// Repositorio en memoria: publicadas, sin borrado lógico y de la más reciente a la más antigua
const memoryRepo = {
  findPublishedByReviewedUser: async (id: string) =>
    stored
      .filter((r) => r.reviewedUserId === id && r.status === REVIEW_STATUS.PUBLISHED && !r.deletedAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
} as unknown as ReviewsRepository;

const memoryProfiles: ProfileClient = {
  findPeople: async (ids: string[]) =>
    new Map<string, ReviewAuthorDto>(
      ids.map((id) => [id, { id, name: id === AUTHOR ? 'Martín Vizcarra' : 'Alumno', profilePhotoUrl: null }]),
    ),
};

const service = new ReviewsServiceImpl(
  memoryRepo,
  { reviewWritten: () => undefined } as unknown as ModerationClient,
  memoryProfiles,
  [],
);

@Module({
  controllers: [ReviewsController],
  providers: [
    { provide: ReviewsService, useValue: service },
    // JwtAuthGuard (de las otras rutas) pide SessionService; GET /reviews/user/:userId es pública
    { provide: SessionService, useValue: {} },
  ],
})
class UserReviewsTestModule {}

interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

describe('HU 5.2 Ver reseñas en un perfil · GET /api/reviews/user/{userId} (caja negra)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    stored.length = 0;
    add(WITH_REVIEWS, 5, REVIEW_STATUS.PUBLISHED);
    add(WITH_REVIEWS, 4, REVIEW_STATUS.PUBLISHED);
    add(WITH_REVIEWS, 4, REVIEW_STATUS.PUBLISHED);
    add(WITH_REVIEWS, 1, REVIEW_STATUS.HIDDEN); // oculta por moderación: no cuenta
    add(WITH_REVIEWS, 1, REVIEW_STATUS.PUBLISHED, true); // eliminada: no cuenta
    add(ONLY_HIDDEN, 2, REVIEW_STATUS.HIDDEN);
    app = await NestFactory.create(UserReviewsTestModule, { logger: false });
    configureHttpApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/${API_PREFIX}`;
  });

  afterAll(async () => {
    await app.close();
  });

  async function get(userId: string): Promise<ApiResponse> {
    const res = await fetch(`${baseUrl}/reviews/user/${userId}`);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  function expectInvalidId(res: ApiResponse): void {
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain(REVIEW_MESSAGES.INVALID_PARAM_ID);
  }

  it('CN01 [EV1]: UUID v4 de un alumno con reseñas → 200 con promedio de 1 decimal, total y lista', async () => {
    const res = await get(WITH_REVIEWS);

    expect(res.status).toBe(200);
    expect(res.body.averageRating).toBe(4.3); // (5 + 4 + 4) / 3 = 4,33
    expect(res.body.totalReviews).toBe(3);
    expect((res.body.reviews as unknown[]).length).toBe(3);
  });

  it('CN02 [EV1]: las reseñas vienen de la más reciente a la más antigua y con autor', async () => {
    const res = await get(WITH_REVIEWS);
    const reviews = res.body.reviews as Array<{ createdAt: string; reviewer: { name: string } }>;

    expect(reviews[0].createdAt > reviews[1].createdAt).toBe(true);
    expect(reviews[0].reviewer.name).toBe('Martín Vizcarra');
  });

  it('CN03 [EV2]: UUID v4 de un alumno sin reseñas → 200 con promedio 0 y lista vacía', async () => {
    const res = await get(WITHOUT_REVIEWS);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: WITHOUT_REVIEWS, averageRating: 0, totalReviews: 0, reviews: [] });
  });

  it('CN04 [EV3]: solo reseñas ocultas por moderación → 200 sin reseñas', async () => {
    const res = await get(ONLY_HIDDEN);

    expect(res.status).toBe(200);
    expect(res.body.totalReviews).toBe(0);
  });

  it('CN05 [EV4]: UUID v4 bien formado pero sin cuenta → 200 vacío (el perfil se valida en SPEC-02)', async () => {
    const res = await get(UNKNOWN);

    expect(res.status).toBe(200);
    expect(res.body.totalReviews).toBe(0);
  });

  it('CN06 [EI1]: texto que no es UUID → 400', async () => {
    expectInvalidId(await get('perfil-de-gaby'));
  });

  it('CN07 [EI2]: UUID de otra versión (v1) → 400', async () => {
    expectInvalidId(await get('6ba7b810-9dad-11d1-80b4-00c04fd430c8'));
  });

  it('CN08 [BV]: 35 caracteres (límite − 1) → 400', async () => {
    expectInvalidId(await get(WITH_REVIEWS.slice(0, 35)));
  });

  it('CN09 [BV]: 37 caracteres (límite + 1) → 400', async () => {
    expectInvalidId(await get(`${WITH_REVIEWS}0`));
  });

  it('CN10 [BV]: 36 caracteres en mayúsculas sigue siendo un UUID v4 válido → 200', async () => {
    const res = await get(WITH_REVIEWS.toUpperCase());

    expect(res.status).toBe(200);
  });
});
