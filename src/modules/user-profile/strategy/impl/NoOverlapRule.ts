import { BadRequestException, Injectable } from '@nestjs/common';
import { AvailabilityContext, AvailabilityRule } from '../AvailabilityRule';

// Regla 3: la franja no se cruza con otra del mismo día -> 400.
// Las franjas contiguas (14:00-16:00 y 16:00-18:00) no se consideran traslape.
@Injectable()
export class NoOverlapRule extends AvailabilityRule {
  validate({ candidate, sameDaySlots, ignoredSlotId }: AvailabilityContext): void {
    const overlaps = sameDaySlots.some(
      (slot) =>
        slot.id !== ignoredSlotId &&
        candidate.startTime < slot.endTime &&
        candidate.endTime > slot.startTime,
    );
    if (overlaps) {
      throw new BadRequestException('La franja horaria se cruza con otra que ya registraste ese día');
    }
  }
}
