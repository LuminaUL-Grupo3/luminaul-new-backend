import { BadRequestException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { OtpGenerator } from '../providers/otp-generator';
import { UserEntity } from '../entities/user.entity';
import { AUTH_MESSAGES, OTP_TTL_MINUTES } from '../auth.constants';

export enum OneTimeCodePurpose {
  EMAIL_VERIFICATION = 'email_verification',
  PASSWORD_RESET = 'password_reset',
}

export interface IssuedCode {
  code: string;
  expiresAt: Date;
}

interface CodeColumns {
  code: 'verificationToken' | 'resetToken';
  expiresAt: 'verificationTokenExpiresAt' | 'resetTokenExpiresAt';
}

const COLUMNS_BY_PURPOSE: Readonly<Record<OneTimeCodePurpose, CodeColumns>> = {
  [OneTimeCodePurpose.EMAIL_VERIFICATION]: {
    code: 'verificationToken',
    expiresAt: 'verificationTokenExpiresAt',
  },
  [OneTimeCodePurpose.PASSWORD_RESET]: { code: 'resetToken', expiresAt: 'resetTokenExpiresAt' },
};

// Composición: verificación de correo y reset de contraseña comparten este algoritmo
// (emitir, comparar, revisar vencimiento y limpiar). Modifica la entidad; quien llama persiste.
@Injectable()
export class OneTimeCodeService {
  constructor(private readonly otpGenerator: OtpGenerator) {}

  // Un código nuevo reemplaza al anterior del mismo propósito
  issue(user: UserEntity, purpose: OneTimeCodePurpose): IssuedCode {
    const columns = COLUMNS_BY_PURPOSE[purpose];
    const issued: IssuedCode = {
      code: this.otpGenerator.generate(),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
    };
    user[columns.code] = issued.code;
    user[columns.expiresAt] = issued.expiresAt;
    return issued;
  }

  // Lanza 400 si el código no coincide o venció; si es válido, lo invalida (un solo uso)
  consume(user: UserEntity, purpose: OneTimeCodePurpose, code: string): void {
    const columns = COLUMNS_BY_PURPOSE[purpose];
    const stored = user[columns.code];
    const expiresAt = user[columns.expiresAt];

    const valid =
      stored !== null &&
      expiresAt !== null &&
      expiresAt.getTime() > Date.now() &&
      safeEquals(stored, code);
    if (!valid) {
      throw new BadRequestException(AUTH_MESSAGES.INVALID_CODE);
    }

    user[columns.code] = null;
    user[columns.expiresAt] = null;
  }
}

// Comparación en tiempo constante para no filtrar dígitos por tiempos de respuesta
function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
