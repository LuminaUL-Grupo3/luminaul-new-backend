import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { OTP_LENGTH } from '../auth.constants';

// Strategy: generación de códigos OTP. Los tests pueden fijar el código.
export abstract class OtpGenerator {
  abstract generate(): string;
}

@Injectable()
export class RandomOtpGenerator extends OtpGenerator {
  // randomInt usa una fuente criptográficamente segura; se rellena con ceros a la izquierda
  generate(): string {
    return randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0');
  }
}
