import { JwtPayload } from '../token/JwtPayload';
import { UserEntity } from '../entities/user.entity';

export interface ValidatedSession {
  payload: JwtPayload;
  user: UserEntity;
}

// Sesiones: emitir, validar (validación dual de SPEC-01) y revocar JWT.
// Lo exporta AuthModule: JwtAuthGuard y group-messaging dependen de esta abstracción.
export abstract class SessionService {
  // Vigencia del token de acceso, en segundos
  abstract get ttlSeconds(): number;

  abstract issueAccessToken(user: UserEntity): string;

  // Recorre la cadena de validación; lanza 401 si alguna regla falla
  abstract validate(token: string): Promise<ValidatedSession>;

  // Guarda el hash hasta que el token expire. Idempotente.
  abstract revoke(token: string): Promise<void>;
}
