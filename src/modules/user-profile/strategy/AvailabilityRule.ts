export interface AvailabilityCandidate {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

export interface AvailabilityContext {
  candidate: AvailabilityCandidate;
  // Franjas ya registradas ese día, con horas en HH:mm
  sameDaySlots: { id: string; startTime: string; endTime: string }[];
  // Franja que se está editando: no cuenta como traslape consigo misma
  ignoredSlotId?: string;
}

// Strategy: cada validación de una franja horaria de SPEC-02 es una estrategia con un único método.
// El service recorre la lista sin un if por regla; una regla nueva es una clase nueva (O de SOLID).
export abstract class AvailabilityRule {
  // No retorna nada si la regla se cumple; si no, lanza BadRequestException con el motivo
  abstract validate(ctx: AvailabilityContext): void;
}
