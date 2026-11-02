import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS } from '../auth.constants';

// Strategy: algoritmo de hash de contraseñas. Se inyecta por la clase abstracta
// (token de DI), así los servicios no dependen de bcrypt y los tests usan un doble.
export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  abstract compare(plain: string, hash: string): Promise<boolean>;
}

@Injectable()
export class BcryptPasswordHasher extends PasswordHasher {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
