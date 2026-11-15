import { BadRequestException, Injectable } from '@nestjs/common';
import { AvailabilityContext, AvailabilityRule } from '../AvailabilityRule';

// Regla 2: la hora de inicio debe ser anterior a la de fin -> 400
@Injectable()
export class StartBeforeEndRule extends AvailabilityRule {
  validate({ candidate }: AvailabilityContext): void {
    if (candidate.startTime >= candidate.endTime) {
      throw new BadRequestException('La hora de inicio debe ser anterior a la hora de fin');
    }
  }
}
