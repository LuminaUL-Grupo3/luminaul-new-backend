import type { CookieOptions } from 'express';

// Valores, mensajes y tokens de SPEC-01 en un solo lugar (DRY): los usan los DTOs, los validadores,
// los servicios, los guards y las pruebas. Los literales exigidos por SPEC-01 se respetan.

// Parámetros de seguridad de SPEC-01
export const AUTH_LIMITS = {
  BCRYPT_ROUNDS: 10,
  OTP_LENGTH: 6,
  OTP_TTL_MINUTES: 15,
  PASSWORD_MIN_LENGTH: 10,
  // bcrypt solo usa los primeros 72 bytes: lo que sobra se ignoraría sin aviso al comparar
  PASSWORD_MAX_BYTES: 72,
  NAME_MAX_LENGTH: 150,
  // Vigencia por defecto del JWT si no se define JWT_EXPIRES_IN (segundos)
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS: 86400,
} as const;

// Mensajes de respuesta y error del módulo
export const AUTH_MESSAGES = {
  REGISTERED: 'Usuario registrado correctamente. Por favor revisa tu correo institucional.',
  EMAIL_TAKEN: 'El correo electrónico ya está registrado',
  INVALID_CREDENTIALS: 'Credenciales incorrectas',
  ACCOUNT_PENDING: 'Debes verificar tu cuenta institucional antes de iniciar sesión',
  ACCOUNT_SUSPENDED: 'Tu cuenta ha sido suspendida por infringir las normas comunitarias',
  EMAIL_VERIFIED: 'Cuenta verificada exitosamente. Ya puedes iniciar sesión.',
  ALREADY_VERIFIED: 'La cuenta ya se encuentra verificada',
  INVALID_CODE: 'El código es inválido o ha expirado',
  CODE_RESENT: 'Si la cuenta está pendiente de verificación, enviaremos un nuevo código a tu correo',
  RESET_CODE_SENT:
    'Si el correo está registrado, recibirás un código para restablecer tu contraseña',
  PASSWORD_RESET: 'Contraseña restablecida correctamente. Inicia sesión con tu nueva contraseña.',
  PASSWORD_CHANGED:
    'Contraseña actualizada. Por seguridad se cerraron tus sesiones: inicia sesión con tu nueva contraseña.',
  WRONG_CURRENT_PASSWORD: 'La contraseña actual es incorrecta',
  SAME_PASSWORD: 'La nueva contraseña debe ser distinta de la actual',
  LOGGED_OUT: 'Sesión cerrada correctamente',
  ACCOUNT_DELETED: 'Cuenta eliminada exitosamente',
  MISSING_TOKEN: 'Falta el token de autenticación',
  INVALID_TOKEN: 'Token inválido o expirado',
  SESSION_CLOSED: 'La sesión ya fue cerrada',
  SESSION_INVALIDATED: 'La sesión ya no es válida. Inicia sesión nuevamente',
  FORBIDDEN_ROLE: 'No tienes permisos para realizar esta acción',
} as const;

// Mensajes de validación de los DTOs (los devuelve ValidationPipe con 400)
export const AUTH_VALIDATION_MESSAGES = {
  INSTITUTIONAL_EMAIL: 'El correo debe ser institucional con dominio @aloe.ulima.edu.pe',
  EMAIL_FORMAT: 'Formato de correo no válido',
  PASSWORD_MIN_LENGTH: 'La contraseña debe tener por lo menos 10 caracteres',
  PASSWORD_MAX_LENGTH:
    'La contraseña no puede superar los 72 caracteres (las letras con tilde y la ñ cuentan como dos)',
  PASSWORD_BLANK: 'La contraseña no puede estar formada solo por espacios',
  PASSWORD_REQUIRED: 'Debes ingresar tu contraseña',
  NEW_PASSWORD_REQUIRED: 'Debes ingresar tu nueva contraseña',
  CURRENT_PASSWORD_REQUIRED: 'Debes ingresar tu contraseña actual',
  NAME_REQUIRED: 'El nombre no puede estar vacío',
  NAME_MAX_LENGTH: 'El nombre no puede superar los 150 caracteres',
  OTP_LENGTH: 'El código de verificación debe contener 6 dígitos',
  OTP_DIGITS: 'El código de verificación solo puede contener números',
} as const;

export const AUTH_PATTERNS = {
  INSTITUTIONAL_EMAIL: /^[a-zA-Z0-9._%+-]+@aloe\.ulima\.edu\.pe$/,
  OTP_DIGITS: /^\d+$/,
} as const;

// Cookie httpOnly que usa el front (fetch con credentials: 'include'), en paralelo al Bearer
export const AUTH_COOKIE = 'access_token';

export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
};

// Token de DI del transporte real; MailSender (lo que piden los servicios) lo envuelve en NonBlockingMailSender
export const MAIL_TRANSPORT = 'AUTH_MAIL_TRANSPORT';

// Token de DI de la cadena ordenada de validación del JWT (el orden lo fija AuthModule)
export const ACCESS_TOKEN_CHECKS = Symbol('ACCESS_TOKEN_CHECKS');
