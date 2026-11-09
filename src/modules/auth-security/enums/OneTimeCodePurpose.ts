// Para qué se emite un código OTP: cada propósito usa sus propias columnas en users
export enum OneTimeCodePurpose {
  EMAIL_VERIFICATION = 'email_verification',
  PASSWORD_RESET = 'password_reset',
}
