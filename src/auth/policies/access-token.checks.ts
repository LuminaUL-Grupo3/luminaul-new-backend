import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { TokenService } from '../providers/token.service';
import { RevokedTokensRepository } from '../repositories/revoked-tokens.repository';
import { UsersRepository } from '../repositories/users.repository';
import { UserEntity } from '../entities/user.entity';
import { UserAccountStatus } from '../enums/user-account-status.enum';
import { AUTH_MESSAGES } from '../auth.constants';
import { hashToken, JwtPayload } from '../token.util';

// Estado que recorre la cadena: cada eslabón lee lo que dejaron los anteriores
export interface AccessTokenContext {
  readonly token: string;
  payload: JwtPayload | null;
  user: UserEntity | null;
}

// Chain of Responsibility: cada eslabón valida una sola regla y corta con 401 si falla.
// SessionService define el orden de la cadena.
export abstract class AccessTokenCheck {
  abstract check(context: AccessTokenContext): Promise<void>;
}

function requirePayload(context: AccessTokenContext): JwtPayload {
  if (!context.payload) {
    throw new InternalServerErrorException('La cadena de validación del token está mal ordenada');
  }
  return context.payload;
}

// 1. Firma HS256 y expiración
@Injectable()
export class SignatureCheck extends AccessTokenCheck {
  constructor(private readonly tokenService: TokenService) {
    super();
  }

  async check(context: AccessTokenContext): Promise<void> {
    context.payload = this.tokenService.verify(context.token);
    if (!context.payload) {
      throw new UnauthorizedException(AUTH_MESSAGES.INVALID_TOKEN);
    }
  }
}

// 2. El token no fue revocado por un logout
@Injectable()
export class RevocationCheck extends AccessTokenCheck {
  constructor(private readonly revokedTokens: RevokedTokensRepository) {
    super();
  }

  async check(context: AccessTokenContext): Promise<void> {
    if (await this.revokedTokens.isRevoked(hashToken(context.token))) {
      throw new UnauthorizedException(AUTH_MESSAGES.SESSION_CLOSED);
    }
  }
}

// 3. El token se emitió después de tokens_valid_after (reset, borrado o suspensión)
@Injectable()
export class TokensValidAfterCheck extends AccessTokenCheck {
  constructor(private readonly users: UsersRepository) {
    super();
  }

  async check(context: AccessTokenContext): Promise<void> {
    const payload = requirePayload(context);
    const user = await this.users.findById(payload.sub);
    // Sin iat no hay forma de comparar con tokens_valid_after: se rechaza
    if (!user || typeof payload.iat !== 'number') {
      throw new UnauthorizedException(AUTH_MESSAGES.SESSION_INVALIDATED);
    }
    // iat está en segundos: se compara contra tokens_valid_after truncado al segundo para no
    // rechazar un login hecho en el mismo segundo en que se invalidaron las sesiones
    const validAfterSeconds = Math.floor(user.tokensValidAfter.getTime() / 1000);
    if (payload.iat < validAfterSeconds) {
      throw new UnauthorizedException(AUTH_MESSAGES.SESSION_INVALIDATED);
    }
    context.user = user;
  }
}

// 4. La cuenta sigue activa
@Injectable()
export class ActiveAccountCheck extends AccessTokenCheck {
  async check(context: AccessTokenContext): Promise<void> {
    if (context.user?.status !== UserAccountStatus.ACTIVE) {
      throw new UnauthorizedException(AUTH_MESSAGES.SESSION_INVALIDATED);
    }
  }
}
