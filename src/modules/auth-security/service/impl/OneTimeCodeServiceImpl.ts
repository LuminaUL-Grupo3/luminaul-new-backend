import { Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { IssuedCode, OneTimeCodeService } from '../OneTimeCodeService';
import { OtpGenerator } from '../../strategy/OtpGenerator';
import { UserEntity } from '../../entities/user.entity';
import { OneTimeCodePurpose } from '../../enums/OneTimeCodePurpose';
import { AuthException } from '../../exception/AuthException';
import { AUTH_LIMITS, AUTH_MESSAGES } from '../../auth.constants';

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

@Injectable()
export class OneTimeCodeServiceImpl extends OneTimeCodeService {
  constructor(private readonly otpGenerator: OtpGenerator) {
    super();
  }

  issue(user: UserEntity, purpose: OneTimeCodePurpose): IssuedCode {
    const columns = COLUMNS_BY_PURPOSE[purpose];
    const issued: IssuedCode = {
      code: this.otpGenerator.generate(),
      expiresAt: new Date(Date.now() + AUTH_LIMITS.OTP_TTL_MINUTES * 60_000),
    };
    user[columns.code] = issued.code;
    user[columns.expiresAt] = issued.expiresAt;
    return issued;
  }

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
      throw new AuthException(AUTH_MESSAGES.INVALID_CODE);
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
