import { HttpStatus, Injectable } from '@nestjs/common';
import { ReviewEligibilityStrategy, RuleViolation } from '../ReviewEligibilityStrategy';
import { REVIEW_MESSAGES } from '../../reviews.constants';

// Regla 2: un alumno no puede calificarse a sí mismo -> 400
@Injectable()
export class NoSelfReviewRule extends ReviewEligibilityStrategy {
  async evaluate(reviewerId: string, reviewedUserId: string): Promise<RuleViolation | null> {
    return reviewerId === reviewedUserId
      ? { status: HttpStatus.BAD_REQUEST, reason: REVIEW_MESSAGES.SELF_REVIEW }
      : null;
  }
}
