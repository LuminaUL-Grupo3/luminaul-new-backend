import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

@Injectable()
export class PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, 12);
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    // Las semillas antiguas contienen 'hash123' o '$fakehash$': no son credenciales.
    if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(encoded)) return false;
    return compare(password, encoded.replace(/^\$2y\$/, '$2b$'));
  }
}
