// Parámetros de seguridad de SPEC-01
export const BCRYPT_ROUNDS = 10;
export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 15;
// Vigencia por defecto del JWT si no se define JWT_EXPIRES_IN (segundos)
export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 86400;

// Mensajes de respuesta y error del módulo (los literales exigidos por SPEC-01 se respetan)
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
  LOGGED_OUT: 'Sesión cerrada correctamente',
  ACCOUNT_DELETED: 'Cuenta eliminada exitosamente',
  MISSING_TOKEN: 'Falta el token de autenticación',
  INVALID_TOKEN: 'Token inválido o expirado',
  SESSION_CLOSED: 'La sesión ya fue cerrada',
  SESSION_INVALIDATED: 'La sesión ya no es válida. Inicia sesión nuevamente',
  FORBIDDEN_ROLE: 'No tienes permisos para realizar esta acción',
} as const;
