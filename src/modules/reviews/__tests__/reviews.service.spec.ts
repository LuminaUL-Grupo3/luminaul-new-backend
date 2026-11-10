import { HttpStatus } from '@nestjs/common';
import { type Mocked } from 'vitest';
import { ReviewsServiceImpl } from '../service/impl/ReviewsServiceImpl';
import { ReviewsRepository } from '../repository/ReviewsRepository';
import { ModerationClient } from '../client/ModerationClient';
import { ProfileClient } from '../client/ProfileClient';
import { ReviewEligibilityStrategy, RuleViolation } from '../strategy/ReviewEligibilityStrategy';
import { ReviewEntity } from '../entities/review.entity';
import { ReviewException } from '../exception/ReviewException';

describe('ReviewsService (Unit)', () => {
  let service: ReviewsServiceImpl;
  let mockReviewsRepo: Mocked<ReviewsRepository>;
  let mockModeration: Mocked<ModerationClient>;
  let mockProfiles: Mocked<ProfileClient>;
  let mockRule1: Mocked<ReviewEligibilityStrategy>;
  let mockRule2: Mocked<ReviewEligibilityStrategy>;

  const reviewerId = 'user-uuid-reviewer';
  const reviewedUserId = 'user-uuid-reviewed';

  beforeEach(() => {
    mockReviewsRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findByReviewerAndReviewed: vi.fn(),
      findByReviewer: vi.fn(),
      findPublishedByReviewedUser: vi.fn(),
    } as unknown as Mocked<ReviewsRepository>;

    mockModeration = {
      reviewWritten: vi.fn(),
    } as unknown as Mocked<ModerationClient>;

    mockProfiles = {
      findPeople: vi.fn().mockResolvedValue(
        new Map([
          [reviewerId, { id: reviewerId, name: 'Reviewer Name', profilePhotoUrl: null }],
          [reviewedUserId, { id: reviewedUserId, name: 'Reviewed Name', profilePhotoUrl: null }],
        ]),
      ),
    } as unknown as Mocked<ProfileClient>;

    mockRule1 = {
      evaluate: vi.fn().mockResolvedValue(null),
    } as unknown as Mocked<ReviewEligibilityStrategy>;

    mockRule2 = {
      evaluate: vi.fn().mockResolvedValue(null),
    } as unknown as Mocked<ReviewEligibilityStrategy>;

    service = new ReviewsServiceImpl(
      mockReviewsRepo,
      mockModeration,
      mockProfiles,
      [mockRule1, mockRule2],
    );
  });

  describe('create', () => {
    it('debe registrar reseña cuando cumple todas las reglas de elegibilidad (Happy Path)', async () => {
      const savedReview: Partial<ReviewEntity> = {
        id: 'review-uuid-1',
        reviewerId,
        reviewedUserId,
        rating: 5,
        comment: 'Excelente colaborador y compañero de estudio',
        status: 'published',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockReviewsRepo.insert.mockResolvedValue(savedReview as ReviewEntity);

      const result = await service.create(reviewerId, {
        reviewedUserId,
        rating: 5,
        comment: 'Excelente colaborador y compañero de estudio',
      });

      expect(result.id).toBe('review-uuid-1');
      expect(result.rating).toBe(5);
      expect(mockReviewsRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ reviewerId, reviewedUserId, rating: 5 }),
      );
      expect(mockModeration.reviewWritten).toHaveBeenCalledWith(savedReview);
    });

    it('debe lanzar ReviewException con HTTP 400 ante intento de auto-calificación', async () => {
      const violation: RuleViolation = {
        reason: 'No puedes calificarte a ti mismo',
        status: HttpStatus.BAD_REQUEST,
      };
      mockRule1.evaluate.mockResolvedValue(violation);

      await expect(
        service.create(reviewerId, {
          reviewedUserId: reviewerId,
          rating: 5,
          comment: 'Auto elogio',
        }),
      ).rejects.toThrow(ReviewException);

      expect(mockReviewsRepo.insert).not.toHaveBeenCalled();
    });

    it('debe lanzar ReviewException con HTTP 409 ante intento de reseña duplicada', async () => {
      const violation: RuleViolation = {
        reason: 'Ya calificaste a este estudiante anteriormente',
        status: HttpStatus.CONFLICT,
      };
      mockRule2.evaluate.mockResolvedValue(violation);

      await expect(
        service.create(reviewerId, {
          reviewedUserId,
          rating: 4,
          comment: 'Segunda calificación',
        }),
      ).rejects.toThrow(ReviewException);

      expect(mockReviewsRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('getUserSummary', () => {
    it('debe calcular promedio y total de reseñas recibidas', async () => {
      const reviews: Partial<ReviewEntity>[] = [
        { id: 'r1', rating: 5, reviewerId, reviewedUserId, createdAt: new Date(), updatedAt: new Date(), status: 'published' },
        { id: 'r2', rating: 3, reviewerId, reviewedUserId, createdAt: new Date(), updatedAt: new Date(), status: 'published' },
      ];
      mockReviewsRepo.findPublishedByReviewedUser.mockResolvedValue(reviews as ReviewEntity[]);

      const summary = await service.getUserSummary(reviewedUserId);

      expect(summary.userId).toBe(reviewedUserId);
      expect(summary.totalReviews).toBe(2);
      expect(summary.averageRating).toBe(4);
    });
  });
});
