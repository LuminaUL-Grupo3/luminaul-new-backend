import { TransformFnParams } from 'class-transformer';
import { ValidateBy, ValidationArguments } from 'class-validator';

export const INSTITUTIONAL_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@aloe\.ulima\.edu\.pe$/;
export const INSTITUTIONAL_EMAIL_MESSAGE =
  'El correo debe ser institucional con dominio @aloe.ulima.edu.pe';
export const EMAIL_FORMAT_MESSAGE = 'Formato de correo no válido';

export const PASSWORD_MIN_LENGTH = 10;
// bcrypt solo usa los primeros 72 bytes: lo que sobra se ignoraría sin aviso al comparar
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_MIN_LENGTH_MESSAGE = 'La contraseña debe tener por lo menos 10 caracteres';
export const PASSWORD_MAX_LENGTH_MESSAGE =
  'La contraseña no puede superar los 72 caracteres (las letras con tilde y la ñ cuentan como dos)';
export const PASSWORD_BLANK_MESSAGE = 'La contraseña no puede estar formada solo por espacios';
export const PASSWORD_REQUIRED_MESSAGE = 'Debes ingresar tu contraseña';
export const NEW_PASSWORD_REQUIRED_MESSAGE = 'Debes ingresar tu nueva contraseña';
export const CURRENT_PASSWORD_REQUIRED_MESSAGE = 'Debes ingresar tu contraseña actual';

export const NAME_REQUIRED_MESSAGE = 'El nombre no puede estar vacío';

export const OTP_REGEX = /^\d+$/;
export const OTP_MESSAGE = 'El código de verificación debe contener 6 dígitos';
export const OTP_DIGITS_MESSAGE = 'El código de verificación solo puede contener números';

// Normaliza el correo antes de validar para que "Ana@Aloe.Ulima.edu.pe" sea aceptado
export const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

// Las reglas se revisan en orden y se reporta solo la primera que falla: con varios decoradores
// sueltos, una contraseña vacía devolvería tres mensajes a la vez
function newPasswordError(value: unknown, requiredMessage: string): string | null {
  if (typeof value !== 'string' || value.length === 0) return requiredMessage;
  if (!/\S/.test(value)) return PASSWORD_BLANK_MESSAGE;
  if (value.length < PASSWORD_MIN_LENGTH) return PASSWORD_MIN_LENGTH_MESSAGE;
  if (Buffer.byteLength(value, 'utf8') > PASSWORD_MAX_BYTES) return PASSWORD_MAX_LENGTH_MESSAGE;
  return null;
}

// Política para toda contraseña nueva (registro, restablecimiento y cambio con sesión iniciada).
// El login no la usa: debe aceptar cualquier contraseña ya guardada.
export function IsNewPassword(requiredMessage = PASSWORD_REQUIRED_MESSAGE): PropertyDecorator {
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
