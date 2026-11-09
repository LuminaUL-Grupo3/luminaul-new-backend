import { TransformFnParams } from 'class-transformer';
import { ValidateBy, ValidationArguments } from 'class-validator';
import { AUTH_LIMITS, AUTH_VALIDATION_MESSAGES } from '../auth.constants';

// Normaliza el correo antes de validar para que "Ana@Aloe.Ulima.edu.pe" sea aceptado
export const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

// Las reglas se revisan en orden y se reporta solo la primera que falla: con varios decoradores
// sueltos, una contraseña vacía devolvería tres mensajes a la vez
function newPasswordError(value: unknown, requiredMessage: string): string | null {
  if (typeof value !== 'string' || value.length === 0) return requiredMessage;
  if (!/\S/.test(value)) return AUTH_VALIDATION_MESSAGES.PASSWORD_BLANK;
  if (value.length < AUTH_LIMITS.PASSWORD_MIN_LENGTH) {
    return AUTH_VALIDATION_MESSAGES.PASSWORD_MIN_LENGTH;
  }
  if (Buffer.byteLength(value, 'utf8') > AUTH_LIMITS.PASSWORD_MAX_BYTES) {
    return AUTH_VALIDATION_MESSAGES.PASSWORD_MAX_LENGTH;
  }
  return null;
}

// Política para toda contraseña nueva (registro, restablecimiento y cambio con sesión iniciada).
// El login no la usa: debe aceptar cualquier contraseña ya guardada.
export function IsNewPassword(
  requiredMessage: string = AUTH_VALIDATION_MESSAGES.PASSWORD_REQUIRED,
): PropertyDecorator {
  return ValidateBy({
    name: 'isNewPassword',
    validator: {
      validate: (value: unknown) => newPasswordError(value, requiredMessage) === null,
      defaultMessage: (args?: ValidationArguments) =>
        newPasswordError(args?.value, requiredMessage) ?? requiredMessage,
    },
  });
}

// Texto obligatorio con un único mensaje (reemplaza a la pareja IsString + IsNotEmpty)
export function IsRequiredText(message: string): PropertyDecorator {
  return ValidateBy({
    name: 'isRequiredText',
    validator: {
      validate: (value: unknown) => typeof value === 'string' && value.length > 0,
      defaultMessage: () => message,
    },
  });
}
