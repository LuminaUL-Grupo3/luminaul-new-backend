import { TransformFnParams } from 'class-transformer';

export const INSTITUTIONAL_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@aloe\.ulima\.edu\.pe$/;
export const INSTITUTIONAL_EMAIL_MESSAGE =
  'El correo debe ser institucional con dominio @aloe.ulima.edu.pe';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MIN_LENGTH_MESSAGE = 'La contraseña debe tener por lo menos 10 caracteres';

export const OTP_REGEX = /^\d+$/;
export const OTP_MESSAGE = 'El código de verificación debe contener 6 dígitos';
export const OTP_DIGITS_MESSAGE = 'El código de verificación solo puede contener números';

// Normaliza el correo antes de validar para que "Ana@Aloe.Ulima.edu.pe" sea aceptado
export const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
