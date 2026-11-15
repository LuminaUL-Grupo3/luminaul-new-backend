import { BadRequestException, Injectable } from '@nestjs/common';
import { AvailabilityContext, AvailabilityRule } from '../AvailabilityRule';

const LATEST_END_TIME = '22:00';

// Regla 1: ninguna franja termina después de las 22:00 -> 400.
// El patrón del DTO también acepta 22:01-22:59: aquí se aplica el tope real.
@Injectable()
export class OperatingHoursRule extends AvailabilityRule {
  validate({ candidate }: AvailabilityContext): void {
    if (candidate.endTime > LATEST_END_TIME) {
      throw new BadRequestException('La hora de fin debe estar entre 07:01 y 22:00');
    }
  }
}
