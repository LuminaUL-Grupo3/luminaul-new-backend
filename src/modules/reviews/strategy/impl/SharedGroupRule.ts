import { HttpStatus, Injectable } from '@nestjs/common';
import { ReviewEligibilityStrategy, RuleViolation } from '../ReviewEligibilityStrategy';
import { GroupMembershipClient } from '../../client/GroupMembershipClient';
import { REVIEW_MESSAGES } from '../../reviews.constants';

// Regla 1: solo se califica a quien fue compañero simultáneo en un grupo de estudio -> 403
@Injectable()
export class SharedGroupRule extends ReviewEligibilityStrategy {
  constructor(private readonly groupMembership: GroupMembershipClient) {
    super();
  }

  async evaluate(reviewerId: string, reviewedUserId: string): Promise<RuleViolation | null> {
    const shared = await this.groupMembership.haveSharedGroup(reviewerId, reviewedUserId);
    return shared ? null : { status: HttpStatus.FORBIDDEN, reason: REVIEW_MESSAGES.NO_SHARED_GROUP };
  }
}
