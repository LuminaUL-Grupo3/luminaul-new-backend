import { DataSource } from 'typeorm';
import { ReviewsServiceImpl } from '../service/impl/ReviewsServiceImpl';
import { ReviewsRepository } from '../repository/ReviewsRepository';
import { ModerationClient } from '../client/ModerationClient';
import { ProfileClientImpl } from '../client/impl/ProfileClientImpl';
import { ReviewEntity } from '../entities/review.entity';
import { REVIEW_STATUS } from '../reviews.constants';

// Prueba de caja blanca (cap. 10.2) — HU 5.2 Ver reseñas en un perfil.
// Módulo probado: el resumen de reseñas de un perfil, es decir, ReviewsServiceImpl.getUserSummary
// con las funciones que ejecuta: averageRating, toResponses, ReviewResponseDto.fromEntity y
// ProfileClientImpl.findPeople. Se usa el ProfileClientImpl real; solo la base de datos es un stub.
//
// Decisiones del módulo:
//   D1  averageRating:  reviews.length === 0
//   D2  findPeople:     ids.length === 0
//   D3  fromEntity:     people.get(reviewerId) ?? unknownPerson(...)       (autor sin cuenta)
//   D4  fromEntity:     people.get(reviewedUserId) ?? unknownPerson(...)   (calificado sin cuenta)
//   D5  findPeople:     row.name ?? ''                                     (sin nombre)
// V(G) = decisiones + 1 = 5 + 1 = 6 > 4.
//
// Caminos independientes (6 = V(G)):
//   C1  D1 V (y D2 V)                     -> promedio 0, total 0, sin consultar perfiles
//   C2  D1 F, D2 F, D3 F, D4 F, D5 F      -> resumen completo con nombres
//   C3  D1 F, D2 F, D3 V, D4 F, D5 F      -> autor sin cuenta: nombre '' y foto null
//   C4  D1 F, D2 F, D3 F, D4 V, D5 F      -> calificado sin cuenta
//   C5  D1 F, D2 F, D3 F, D4 F, D5 V      -> cuenta sin nombre: name ''
//   C6  D1 F, D2 F, D3 V, D4 V            -> ninguna cuenta existe
// D1 y D2 están ligadas: sin reseñas no hay ids que consultar. Con C1..C6 cada decisión toma los
// valores verdadero y falso: 100 % de cobertura de ramas del módulo.

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

describe('HU 5.2 Resumen de reseñas de un perfil (caja blanca · V(G) = 6 > 4)', () => {
  let rows: PersonRow[];
  let getRawMany: ReturnType<typeof vi.fn>;
  let repo: ReviewsRepository;
  let service: ReviewsServiceImpl;

  beforeEach(() => {
    rows = [];
    getRawMany = vi.fn(async () => rows);
    // Stub del QueryBuilder de TypeORM: cada método devuelve el mismo objeto y getRawMany las filas
    const qb: Record<string, unknown> = { getRawMany };
    for (const m of ['select', 'addSelect', 'from', 'leftJoin', 'where']) qb[m] = vi.fn(() => qb);
    const dataSource = { createQueryBuilder: vi.fn(() => qb) } as unknown as DataSource;

    repo = { findPublishedByReviewedUser: vi.fn() } as unknown as ReviewsRepository;
    const moderation = { reviewWritten: vi.fn() } as unknown as ModerationClient;
    service = new ReviewsServiceImpl(repo, moderation, new ProfileClientImpl(dataSource), []);
  });

  function withReviews(list: ReviewEntity[]): void {
    vi.mocked(repo.findPublishedByReviewedUser).mockResolvedValue(list);
  }

  it('C1 · D1 V y D2 V: sin reseñas devuelve promedio 0 y no consulta perfiles', async () => {
    withReviews([]);

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary).toEqual({ userId: REVIEWED, averageRating: 0, totalReviews: 0, reviews: [] });
    expect(getRawMany).not.toHaveBeenCalled();
  });

  it('C2 · D1..D5 F: con reseñas y cuentas completas devuelve promedio, total y nombres', async () => {
    withReviews([review(5), review(4)]);
    rows = [
      { id: AUTHOR, name: 'Martín Vizcarra', profilePhotoUrl: 'https://avatar.test/m.png' },
      { id: REVIEWED, name: 'Gabriela Garay', profilePhotoUrl: null },
    ];

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary.averageRating).toBe(4.5);
    expect(summary.totalReviews).toBe(2);
    expect(summary.reviews[0].reviewer).toEqual({
      id: AUTHOR,
      name: 'Martín Vizcarra',
      profilePhotoUrl: 'https://avatar.test/m.png',
    });
    expect(summary.reviews[0].reviewedUser.name).toBe('Gabriela Garay');
    expect(getRawMany).toHaveBeenCalledTimes(1);
  });

  it('C3 · D3 V: el autor ya no tiene cuenta y se muestra sin nombre ni foto', async () => {
    withReviews([review(3)]);
    rows = [{ id: REVIEWED, name: 'Gabriela Garay', profilePhotoUrl: null }];

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary.reviews[0].reviewer).toEqual({ id: AUTHOR, name: '', profilePhotoUrl: null });
    expect(summary.reviews[0].reviewedUser.name).toBe('Gabriela Garay');
  });

  it('C4 · D4 V: el alumno calificado no aparece en perfiles', async () => {
    withReviews([review(3)]);
    rows = [{ id: AUTHOR, name: 'Martín Vizcarra', profilePhotoUrl: null }];

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary.reviews[0].reviewer.name).toBe('Martín Vizcarra');
    expect(summary.reviews[0].reviewedUser).toEqual({ id: REVIEWED, name: '', profilePhotoUrl: null });
  });

  it('C5 · D5 V: una cuenta sin nombre se devuelve con name vacío', async () => {
    withReviews([review(2)]);
    rows = [
      { id: AUTHOR, name: null, profilePhotoUrl: null },
      { id: REVIEWED, name: 'Gabriela Garay', profilePhotoUrl: null },
    ];

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary.reviews[0].reviewer.name).toBe('');
    expect(summary.averageRating).toBe(2);
  });

  it('C6 · D3 V y D4 V: ninguna cuenta existe y ambas personas quedan vacías', async () => {
    withReviews([review(1)]);
    rows = [];

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary.reviews[0].reviewer.name).toBe('');
    expect(summary.reviews[0].reviewedUser.name).toBe('');
    expect(summary.totalReviews).toBe(1);
  });
});
