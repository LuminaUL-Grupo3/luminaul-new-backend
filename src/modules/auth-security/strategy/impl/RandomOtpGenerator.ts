import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { OtpGenerator } from '../OtpGenerator';
import { AUTH_LIMITS } from '../../auth.constants';

@Injectable()
export class RandomOtpGenerator extends OtpGenerator {
  // randomInt usa una fuente criptográficamente segura; se rellena con ceros a la izquierda
  generate(): string {
    return randomInt(0, 10 ** AUTH_LIMITS.OTP_LENGTH)
      .toString()
      .padStart(AUTH_LIMITS.OTP_LENGTH, '0');
  }
}
