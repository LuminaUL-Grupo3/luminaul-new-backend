import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AvailabilityContext } from '../strategy/AvailabilityRule';
import { OperatingHoursRule } from '../strategy/impl/OperatingHoursRule';
import { StartBeforeEndRule } from '../strategy/impl/StartBeforeEndRule';
import { NoOverlapRule } from '../strategy/impl/NoOverlapRule';

// Pruebas del patrón Strategy de SPEC-02: una regla por validación de franja horaria.

const context = (
  startTime: string,
  endTime: string,
  overrides: Partial<AvailabilityContext> = {},
): AvailabilityContext => ({
  candidate: { dayOfWeek: 'lunes', startTime, endTime },
  sameDaySlots: [],
  ...overrides,
});

describe('SPEC-02: patrones del curso', () => {
  describe('Strategy: OperatingHoursRule', () => {
    const rule = new OperatingHoursRule();

    it('rechaza una hora de fin posterior a las 22:00', () => {
      expect(() => rule.validate(context('21:00', '22:30'))).toThrow(
        new BadRequestException('La hora de fin debe estar entre 07:01 y 22:00'),
      );
    });

    it('acepta una franja que termina exactamente a las 22:00', () => {
      expect(() => rule.validate(context('20:00', '22:00'))).not.toThrow();
    });
  });

  describe('Strategy: StartBeforeEndRule', () => {
    const rule = new StartBeforeEndRule();

    it('rechaza una hora de inicio mayor que la de fin', () => {
      expect(() => rule.validate(context('16:00', '14:00'))).toThrow(
        new BadRequestException('La hora de inicio debe ser anterior a la hora de fin'),
      );
    });

    it('rechaza una hora de inicio igual a la de fin', () => {
      expect(() => rule.validate(context('14:00', '14:00'))).toThrow(BadRequestException);
    });

    it('acepta una hora de inicio anterior a la de fin', () => {
      expect(() => rule.validate(context('14:00', '16:00'))).not.toThrow();
    });
  });

  describe('Strategy: NoOverlapRule', () => {
    const rule = new NoOverlapRule();
    const existing = { id: 'slot-existing', startTime: '14:00', endTime: '16:00' };

    it('rechaza una franja que se cruza con otra del mismo día', () => {
      expect(() => rule.validate(context('15:00', '17:00', { sameDaySlots: [existing] }))).toThrow(
        new BadRequestException('La franja horaria se cruza con otra que ya registraste ese día'),
      );
    });

    it('permite franjas contiguas (14:00-16:00 y 16:00-18:00)', () => {
      expect(() =>
        rule.validate(context('16:00', '18:00', { sameDaySlots: [existing] })),
      ).not.toThrow();
      expect(() =>
        rule.validate(context('12:00', '14:00', { sameDaySlots: [existing] })),
      ).not.toThrow();
    });

    it('ignora la franja que se está editando', () => {
      expect(() =>
        rule.validate(
          context('15:00', '17:00', { sameDaySlots: [existing], ignoredSlotId: existing.id }),
        ),
      ).not.toThrow();
    });
  });
});
