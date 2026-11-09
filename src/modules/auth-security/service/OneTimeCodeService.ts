import { UserEntity } from '../entities/user.entity';
import { OneTimeCodePurpose } from '../enums/OneTimeCodePurpose';

export interface IssuedCode {
  code: string;
  expiresAt: Date;
}

// Composición: verificación de correo y reset de contraseña comparten este algoritmo
// (emitir, comparar, revisar vencimiento y limpiar). Modifica la entidad; quien llama persiste.
export abstract class OneTimeCodeService {
  // Un código nuevo reemplaza al anterior del mismo propósito
  abstract issue(user: UserEntity, purpose: OneTimeCodePurpose): IssuedCode;

  // Lanza 400 si el código no coincide o venció; si es válido, lo invalida (un solo uso)
  abstract consume(user: UserEntity, purpose: OneTimeCodePurpose, code: string): void;
}
