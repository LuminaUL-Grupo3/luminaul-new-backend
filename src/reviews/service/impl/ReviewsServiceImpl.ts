import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ReviewsService } from '../ReviewsService';
import { ReviewsRepository } from '../../repository/ReviewsRepository';
import { ModerationClient } from '../../client/ModerationClient';
import { ProfileClient } from '../../client/ProfileClient';
import { ReviewEligibilityStrategy, RuleViolation } from '../../strategy/ReviewEligibilityStrategy';
import { ReviewEntity } from '../../entities/review.entity';
import { CreateReviewDto } from '../../dto/CreateReviewDto';
import { UpdateReviewDto } from '../../dto/UpdateReviewDto';
import { ReviewResponseDto } from '../../dto/ReviewResponseDto';
import { UserReviewsSummaryDto } from '../../dto/UserReviewsSummaryDto';
import { ReviewEligibilityResponseDto } from '../../dto/ReviewEligibilityResponseDto';
import { DeleteReviewResponseDto } from '../../dto/DeleteReviewResponseDto';
import { ReviewException } from '../../exception/ReviewException';
import {
  REVIEW_ELIGIBILITY_RULES,
  REVIEW_MESSAGES,
  REVIEW_STATUS,
} from '../../reviews.constants';

// Coordina los casos de uso: valida con las reglas, persiste con el repositorio, avisa a moderación y
// completa nombre y foto con ProfileClient.
// Facade: el controller solo llama a ReviewsService y no conoce a esos subsistemas.
// Solo conoce abstracciones; ReviewsModule le entrega las implementaciones.
@Injectable()
export class ReviewsServiceImpl extends ReviewsService {
  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly moderation: ModerationClient,
    private readonly profiles: ProfileClient,
    @Inject(REVIEW_ELIGIBILITY_RULES)
    private readonly rules: ReviewEligibilityStrategy[],
  ) {
    super();
  }

  async create(reviewerId: string, payload: CreateReviewDto): Promise<ReviewResponseDto> {
    const violation = await this.findViolation(reviewerId, payload.reviewedUserId);
    if (violation) {
      throw new ReviewException(violation.reason, violation.status);
    }

    const review = await this.reviewsRepository.insert({
      reviewerId,
      reviewedUserId: payload.reviewedUserId,
      rating: payload.rating,
      comment: payload.comment,
      status: REVIEW_STATUS.PUBLISHED,
    });
    this.moderation.reviewWritten(review);
    const [response] = await this.toResponses([review]);
    return response;
  }

  async getUserSummary(userId: string): Promise<UserReviewsSummaryDto> {
    const reviews = await this.reviewsRepository.findPublishedByReviewedUser(userId);
    return {
      userId,
      averageRating: averageRating(reviews),
      totalReviews: reviews.length,
      reviews: await this.toResponses(reviews),
    };
  }

  async listMine(reviewerId: string): Promise<ReviewResponseDto[]> {
    return this.toResponses(await this.reviewsRepository.findActiveByReviewer(reviewerId));
  }

  // Mismas reglas que create, pero responde el motivo en vez de lanzar el error
  async checkEligibility(
    reviewerId: string,
    reviewedUserId: string,
  ): Promise<ReviewEligibilityResponseDto> {
    const violation = await this.findViolation(reviewerId, reviewedUserId);
    return violation ? { allowed: false, reason: violation.reason } : { allowed: true };
  }

  async update(
    reviewId: string,
    payload: UpdateReviewDto,
    actorId: string,
  ): Promise<ReviewResponseDto> {
    const review = await this.findOwnReview(reviewId, actorId);
    review.rating = payload.rating ?? review.rating;
    review.comment = payload.comment ?? review.comment;

    const updated = await this.reviewsRepository.update(review);
    // Texto nuevo: moderación lo vuelve a revisar
    if (payload.comment !== undefined) {
      this.moderation.reviewWritten(updated);
    }
    const [response] = await this.toResponses([updated]);
    return response;
  }

  async remove(reviewId: string, actorId: string): Promise<DeleteReviewResponseDto> {
    await this.findOwnReview(reviewId, actorId);
    if (!(await this.reviewsRepository.delete(reviewId))) {
      throw new ReviewException(REVIEW_MESSAGES.NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return { message: REVIEW_MESSAGES.DELETED, deletedId: reviewId };
  }

  // Primera regla incumplida, en el orden que fija ReviewsModule; null si puede calificar
  private async findViolation(
    reviewerId: string,
    reviewedUserId: string,
  ): Promise<RuleViolation | null> {
    for (const rule of this.rules) {
      const violation = await rule.evaluate(reviewerId, reviewedUserId);
      if (violation) {
        return violation;
      }
    }
    return null;
  }

  // HU 5.3 y 5.4: solo el autor edita o elimina su reseña (403 para cualquier otro)
  private async findOwnReview(reviewId: string, actorId: string): Promise<ReviewEntity> {
    const review = await this.reviewsRepository.findById(reviewId);
    if (!review) {
      throw new ReviewException(REVIEW_MESSAGES.NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (review.reviewerId !== actorId) {
      throw new ReviewException(REVIEW_MESSAGES.NOT_AUTHOR, HttpStatus.FORBIDDEN);
    }
    return review;
  }

  // Arma los ReviewDto con una sola consulta de nombres y fotos para todas las reseñas
  private async toResponses(reviews: ReviewEntity[]): Promise<ReviewResponseDto[]> {
    const people = await this.profiles.findPeople(
      reviews.flatMap((review) => [review.reviewerId, review.reviewedUserId]),
    );
    return reviews.map((review) => ReviewResponseDto.fromEntity(review, people));
  }
}

// Promedio de estrellas redondeado a 1 decimal; 0 si todavía no hay reseñas
function averageRating(reviews: ReviewEntity[]): number {
  if (reviews.length === 0) {
    return 0;
  }
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return Math.round((total / reviews.length) * 10) / 10;
}
