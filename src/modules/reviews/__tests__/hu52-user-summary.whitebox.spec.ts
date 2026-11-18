import { DataSource } from 'typeorm';
import { ReviewsServiceImpl } from '../service/impl/ReviewsServiceImpl';
import { ReviewsRepository } from '../repository/ReviewsRepository';
import { ModerationClient } from '../client/ModerationClient';
import { ProfileClientImpl } from '../client/impl/ProfileClientImpl';
import { ReviewEntity } from '../entities/review.entity';
import { REVIEW_STATUS } from '../reviews.constants';

// Prueba de caja blanca (cap. 10.2) — HU 5.2 Ver reseñas en un perfil.
// Módulo: el resumen de reseñas de un perfil. getUserSummary llama a averageRating, toResponses,
// ProfileClientImpl.findPeople y ReviewResponseDto.fromEntity. Como en clase, se simula solo la
// capa inferior: el repositorio y la base de datos (DataSource) son stubs.
//
// Grafo de flujo (Grafo_flujo_caja_blanca_HU5.2.png):
//    1 obtener reseñas publicadas          9 nombre = ''
//    2 ¿sin reseñas?          (predicado)  10 armar mapa de personas
//    3 promedio = 0                        11 ¿autor sin cuenta?      (predicado)
//    4 promedio con 1 decimal              12 autor vacío
//    5 ¿sin ids? (findPeople) (predicado)  13 ¿calificado sin cuenta? (predicado)
//    6 mapa vacío                          14 calificado vacío
//    7 consultar users y profiles          15 devolver el resumen
//    8 ¿nombre nulo?          (predicado)
//
// Complejidad ciclomática:  V(G) = predicados + 1 = 5 + 1 = 6
//                           V(G) = aristas − nodos + 2 = 19 − 15 + 2 = 6
// Caminos básicos (uno por prueba):
//   C1  1-2-3-5-6-15                  sin reseñas
//   C2  1-2-4-5-7-8-10-11-13-15       reseñas con todas las cuentas completas
//   C3  1-2-4-5-7-8-9-10-11-13-15     una cuenta sin nombre
//   C4  1-2-4-5-7-8-10-11-12-13-15    el autor ya no tiene cuenta
//   C5  1-2-4-5-7-8-10-11-13-14-15    el calificado no tiene cuenta
//   C6  1-2-4-5-7-8-10-11-12-13-14-15 ninguna de las dos cuentas existe
// Con los 6 caminos cada predicado sale por V y por F: 100 % de cobertura de ramas del módulo.

const REVIEWED = 'a1b2c3d4-e5f6-47a8-b9c0-123456789abc';
const AUTHOR = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

interface PersonRow {
  id: string;
  name: string | null;
  profilePhotoUrl: string | null;
}

function review(rating: number): ReviewEntity {
  return {
    id: '99887766-5544-4322-8100-aabbccddeeff',
    reviewerId: AUTHOR,
    reviewedUserId: REVIEWED,
    rating,
    comment: 'Muy responsable con los entregables.',
    status: REVIEW_STATUS.PUBLISHED,
    createdAt: new Date('2026-10-12T10:00:00Z'),
    updatedAt: new Date('2026-10-12T10:00:00Z'),
    deletedAt: null,
  } as ReviewEntity;
}

describe('HU 5.2 Resumen de reseñas de un perfil (caja blanca · V(G) = 6)', () => {
  let rows: PersonRow[];
  let getRawMany: ReturnType<typeof vi.fn>;
  let repo: ReviewsRepository;
  let service: ReviewsServiceImpl;

  beforeEach(() => {
    rows = [];
    getRawMany = vi.fn(async () => rows);
    // Stub de la base de datos: el QueryBuilder devuelve las filas que define cada prueba
    const qb: Record<string, unknown> = { getRawMany };
    for (const m of ['select', 'addSelect', 'from', 'leftJoin', 'where']) qb[m] = vi.fn(() => qb);
    const dataSource = { createQueryBuilder: vi.fn(() => qb) } as unknown as DataSource;

    repo = { findPublishedByReviewedUser: vi.fn() } as unknown as ReviewsRepository;
    const moderation = { reviewWritten: vi.fn() } as unknown as ModerationClient;
    service = new ReviewsServiceImpl(repo, moderation, new ProfileClientImpl(dataSource), []);
  });

  it('C1 · camino 1-2-3-5-6-15: sin reseñas devuelve promedio 0 y no consulta perfiles', async () => {
    // Arrange
    vi.mocked(repo.findPublishedByReviewedUser).mockResolvedValue([]);
    // Act
    const summary = await service.getUserSummary(REVIEWED);
    // Assert
    expect(summary).toEqual({ userId: REVIEWED, averageRating: 0, totalReviews: 0, reviews: [] });
    expect(getRawMany).not.toHaveBeenCalled();
  });

  it('C2 · camino 1-2-4-5-7-8-10-11-13-15: cuentas completas devuelven promedio y nombres', async () => {
    vi.mocked(repo.findPublishedByReviewedUser).mockResolvedValue([review(5), review(4)]);
    rows = [
      { id: AUTHOR, name: 'Martín Vizcarra', profilePhotoUrl: null },
      { id: REVIEWED, name: 'Gabriela Garay', profilePhotoUrl: null },
    ];

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary.averageRating).toBe(4.5);
    expect(summary.totalReviews).toBe(2);
    expect(summary.reviews[0].reviewer.name).toBe('Martín Vizcarra');
    expect(summary.reviews[0].reviewedUser.name).toBe('Gabriela Garay');
  });

  it('C3 · camino 1-2-4-5-7-8-9-10-11-13-15: una cuenta sin nombre se devuelve con nombre vacío', async () => {
    vi.mocked(repo.findPublishedByReviewedUser).mockResolvedValue([review(2)]);
    rows = [
      { id: AUTHOR, name: null, profilePhotoUrl: null },
      { id: REVIEWED, name: 'Gabriela Garay', profilePhotoUrl: null },
    ];

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary.reviews[0].reviewer.name).toBe('');
    expect(summary.averageRating).toBe(2);
  });

  it('C4 · camino 1-2-4-5-7-8-10-11-12-13-15: el autor sin cuenta aparece sin nombre ni foto', async () => {
    vi.mocked(repo.findPublishedByReviewedUser).mockResolvedValue([review(3)]);
    rows = [{ id: REVIEWED, name: 'Gabriela Garay', profilePhotoUrl: null }];

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary.reviews[0].reviewer).toEqual({ id: AUTHOR, name: '', profilePhotoUrl: null });
    expect(summary.reviews[0].reviewedUser.name).toBe('Gabriela Garay');
  });

  it('C5 · camino 1-2-4-5-7-8-10-11-13-14-15: el calificado sin cuenta aparece vacío', async () => {
    vi.mocked(repo.findPublishedByReviewedUser).mockResolvedValue([review(3)]);
    rows = [{ id: AUTHOR, name: 'Martín Vizcarra', profilePhotoUrl: null }];

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary.reviews[0].reviewer.name).toBe('Martín Vizcarra');
    expect(summary.reviews[0].reviewedUser).toEqual({ id: REVIEWED, name: '', profilePhotoUrl: null });
  });

  it('C6 · camino 1-2-4-5-7-8-10-11-12-13-14-15: ninguna cuenta existe', async () => {
    vi.mocked(repo.findPublishedByReviewedUser).mockResolvedValue([review(1)]);
    rows = [];

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary.reviews[0].reviewer.name).toBe('');
    expect(summary.reviews[0].reviewedUser.name).toBe('');
    expect(summary.totalReviews).toBe(1);
  });
});
