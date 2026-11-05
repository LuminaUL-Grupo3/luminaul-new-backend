import { HttpStatus } from '@nestjs/common';
import { ReviewsServiceImpl } from '../service/impl/ReviewsServiceImpl';
import { ReviewsRepository } from '../repository/ReviewsRepository';
import { ModerationClient } from '../client/ModerationClient';
import { ProfileClient } from '../client/ProfileClient';
import { ReviewEligibilityStrategy, RuleViolation } from '../strategy/ReviewEligibilityStrategy';
import { ReviewEntity } from '../entities/review.entity';
import { ReviewException } from '../exception/ReviewException';

describe('ReviewsService (Unit)', () => {
  let service: ReviewsServiceImpl;
  let mockReviewsRepo: jest.Mocked<ReviewsRepository>;
  let mockModeration: jest.Mocked<ModerationClient>;
  let mockProfiles: jest.Mocked<ProfileClient>;
  let mockRule1: jest.Mocked<ReviewEligibilityStrategy>;
  let mockRule2: jest.Mocked<ReviewEligibilityStrategy>;

  const reviewerId = 'user-uuid-reviewer';
  const reviewedUserId = 'user-uuid-reviewed';

  beforeEach(() => {
    mockReviewsRepo = {
      findById: jest.fn(),
      findAll: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByReviewerAndReviewed: jest.fn(),
      findByReviewer: jest.fn(),
      findPublishedByReviewedUser: jest.fn(),
    } as unknown as jest.Mocked<ReviewsRepository>;

    mockModeration = {
      reviewWritten: jest.fn(),
    } as unknown as jest.Mocked<ModerationClient>;

    mockProfiles = {
      findPeople: jest.fn().mockResolvedValue(
        new Map([
          [reviewerId, { id: reviewerId, name: 'Reviewer Name', profilePhotoUrl: null }],
          [reviewedUserId, { id: reviewedUserId, name: 'Reviewed Name', profilePhotoUrl: null }],
        ]),
      ),
    } as unknown as jest.Mocked<ProfileClient>;

    mockRule1 = {
      evaluate: jest.fn().mockResolvedValue(null),
    };

    mockRule2 = {
      evaluate: jest.fn().mockResolvedValue(null),
    };

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
