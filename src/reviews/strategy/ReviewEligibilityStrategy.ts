import { HttpStatus } from '@nestjs/common';

// Motivo por el que una regla impide calificar; SPEC-05 §4 fija el código HTTP de cada caso
export interface RuleViolation {
  readonly status: HttpStatus;
  readonly reason: string;
}

// Strategy: cada regla de negocio de SPEC-05 §4 es una estrategia con un único método.
// El service recorre la lista sin un if por regla; una regla nueva es una clase nueva (O de SOLID).
export abstract class ReviewEligibilityStrategy {
  // null si la regla se cumple; si no, el motivo y su código HTTP
  abstract evaluate(reviewerId: string, reviewedUserId: string): Promise<RuleViolation | null>;
}
