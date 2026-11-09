import { JwtPayload } from '../token/JwtPayload';
import { UserEntity } from '../entities/user.entity';

// Estado que recorre la cadena: cada eslabón lee lo que dejaron los anteriores
export interface AccessTokenContext {
  readonly token: string;
  payload: JwtPayload | null;
  user: UserEntity | null;
}

// Chain of Responsibility: cada eslabón valida una sola regla y corta con 401 si falla.
// AuthModule define el orden de la cadena (token ACCESS_TOKEN_CHECKS).
export abstract class AccessTokenCheck {
  abstract check(context: AccessTokenContext): Promise<void>;
}
