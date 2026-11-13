import { type Mocked } from 'vitest';
import { ReviewsServiceImpl } from '../service/impl/ReviewsServiceImpl';
import { ReviewsRepository } from '../repository/ReviewsRepository';
import { ModerationClient } from '../client/ModerationClient';
import { ProfileClient } from '../client/ProfileClient';
import { ReviewEntity } from '../entities/review.entity';
import { REVIEW_STATUS } from '../reviews.constants';

// Prueba unitaria (cap. 10.4) — HU 5.2 Ver reseñas en un perfil.
// Método probado: ReviewsServiceImpl.getUserSummary(userId).
// Aislamiento: el repositorio y ProfileClient son stubs (vi.fn), así que solo se ejecuta la lógica
// del servicio: promedio con un decimal, total y armado de las reseñas.
// Estructura AAA (Arrange, Act, Assert) y nombres metodo_debe..._cuando....
// Valores límite de la calificación: 1 (mínimo) y 5 (máximo).

const REVIEWED = 'a1b2c3d4-e5f6-47a8-b9c0-123456789abc';
const AUTHOR = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

function review(rating: number, n = 1): ReviewEntity {
  return {
    id: `99887766-5544-4322-8100-${String(n).padStart(12, '0')}`,
    reviewerId: AUTHOR,
    reviewedUserId: REVIEWED,
    rating,
    comment: `Comentario ${n}`,
    status: REVIEW_STATUS.PUBLISHED,
    createdAt: new Date('2026-10-12T10:00:00Z'),
    updatedAt: new Date('2026-10-12T10:00:00Z'),
    deletedAt: null,
  } as ReviewEntity;
}

describe('HU 5.2 ReviewsServiceImpl.getUserSummary (prueba unitaria)', () => {
  let service: ReviewsServiceImpl;
  let repo: Mocked<ReviewsRepository>;
  let profiles: Mocked<ProfileClient>;

  beforeEach(() => {
    repo = { findPublishedByReviewedUser: vi.fn() } as unknown as Mocked<ReviewsRepository>;
    profiles = {
      findPeople: vi.fn().mockResolvedValue(
        new Map([
          [AUTHOR, { id: AUTHOR, name: 'Martín Vizcarra', profilePhotoUrl: null }],
          [REVIEWED, { id: REVIEWED, name: 'Gabriela Garay', profilePhotoUrl: null }],
        ]),
      ),
    } as unknown as Mocked<ProfileClient>;
    const moderation = { reviewWritten: vi.fn() } as unknown as ModerationClient;
    service = new ReviewsServiceImpl(repo, moderation, profiles, []);
  });

  it('U1 getUserSummary_debeDevolverPromedioCeroYListaVacia_cuandoNoHayResenas', async () => {
    // Arrange
    repo.findPublishedByReviewedUser.mockResolvedValue([]);
    // Act
    const summary = await service.getUserSummary(REVIEWED);
    // Assert
    expect(summary).toEqual({ userId: REVIEWED, averageRating: 0, totalReviews: 0, reviews: [] });
  });

  it('U2 getUserSummary_debeDevolverLaMismaCalificacion_cuandoHayUnaSolaResena', async () => {
    repo.findPublishedByReviewedUser.mockResolvedValue([review(4)]);

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary.averageRating).toBe(4);
    expect(summary.totalReviews).toBe(1);
    expect(summary.reviews[0].reviewer.name).toBe('Martín Vizcarra');
  });

  it('U3 getUserSummary_debeRedondearHaciaAbajo_cuandoElSegundoDecimalEsMenorA5', async () => {
    // 5 + 4 + 4 = 13 / 3 = 4,333... -> 4,3
    repo.findPublishedByReviewedUser.mockResolvedValue([review(5, 1), review(4, 2), review(4, 3)]);

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary.averageRating).toBe(4.3);
    expect(summary.totalReviews).toBe(3);
  });

  it('U4 getUserSummary_debeRedondearHaciaArriba_cuandoElSegundoDecimalEsMayorOIgualA5', async () => {
    // 5 + 5 + 4 = 14 / 3 = 4,666... -> 4,7
    repo.findPublishedByReviewedUser.mockResolvedValue([review(5, 1), review(5, 2), review(4, 3)]);

    const summary = await service.getUserSummary(REVIEWED);

    expect(summary.averageRating).toBe(4.7);
  });

  it('U5 getUserSummary_debeDevolver1y5_cuandoTodasLasResenasTienenElValorLimite', async () => {
    repo.findPublishedByReviewedUser.mockResolvedValueOnce([review(1, 1), review(1, 2)]);
    repo.findPublishedByReviewedUser.mockResolvedValueOnce([review(5, 1), review(5, 2)]);

    const minimo = await service.getUserSummary(REVIEWED);
    const maximo = await service.getUserSummary(REVIEWED);

    expect(minimo.averageRating).toBe(1);
    expect(maximo.averageRating).toBe(5);
  });

  it('U6 getUserSummary_debeConsultarSoloAlAlumnoPedido_cuandoSeLlamaConSuId', async () => {
    repo.findPublishedByReviewedUser.mockResolvedValue([review(3)]);

    const summary = await service.getUserSummary(REVIEWED);

    expect(repo.findPublishedByReviewedUser).toHaveBeenCalledTimes(1);
    expect(repo.findPublishedByReviewedUser).toHaveBeenCalledWith(REVIEWED);
    expect(profiles.findPeople).toHaveBeenCalledWith([AUTHOR, REVIEWED]);
    expect(summary.userId).toBe(REVIEWED);
  });
});
