import { HttpStatus, Injectable } from '@nestjs/common';
import { ReviewEligibilityStrategy, RuleViolation } from '../ReviewEligibilityStrategy';
import { ReviewsRepository } from '../../repository/ReviewsRepository';
import { REVIEW_MESSAGES } from '../../reviews.constants';

// Regla 3: una sola reseña vigente por par de alumnos -> 409 (para cambiarla se usa PUT)
@Injectable()
export class UniqueReviewRule extends ReviewEligibilityStrategy {
  constructor(private readonly reviewsRepository: ReviewsRepository) {
    super();
  }

  async evaluate(reviewerId: string, reviewedUserId: string): Promise<RuleViolation | null> {
    const existing = await this.reviewsRepository.findActiveByPair(reviewerId, reviewedUserId);
    return existing ? { status: HttpStatus.CONFLICT, reason: REVIEW_MESSAGES.ALREADY_REVIEWED } : null;
  }
}
