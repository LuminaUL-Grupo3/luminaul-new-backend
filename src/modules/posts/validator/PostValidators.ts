import { ValidateBy, ValidationArguments } from 'class-validator';

function boundedIntError(
  value: unknown,
  label: string,
  min: number,
  max?: number,
): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return `${label} debe ser un número entero`;
  }
  if (value < min) {
    return `${label} debe ser mayor o igual a ${min}`;
  }
  if (max !== undefined && value > max) {
    return `${label} no puede superar ${max}`;
  }
  return null;
}

/** Valida entero y rango en orden, reportando solo el primer error (evita mensajes contradictorios en NaN). */
export function IsBoundedInt(
  label: string,
  min: number,
  max?: number,
): PropertyDecorator {
  return ValidateBy({
    name: 'isBoundedInt',
    validator: {
      validate: (value: unknown) => boundedIntError(value, label, min, max) === null,
      defaultMessage: (args?: ValidationArguments) =>
        boundedIntError(args?.value, label, min, max) ??
        `${label} debe ser un número entero`,
    },
  });
}
