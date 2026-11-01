import { Injectable, UnauthorizedException } from '@nestjs/common';
import { TokenService } from '../providers/token.service';
import { RevokedTokensRepository } from '../repositories/revoked-tokens.repository';
import {
  AccessTokenCheck,
  AccessTokenContext,
  ActiveAccountCheck,
  RevocationCheck,
  SignatureCheck,
  TokensValidAfterCheck,
} from '../policies/access-token.checks';
import { UserEntity } from '../entities/user.entity';
import { AUTH_MESSAGES } from '../auth.constants';
import { buildJwtPayload, hashToken, JwtPayload } from '../token.util';

export interface ValidatedSession {
  payload: JwtPayload;
  user: UserEntity;
}

// Sesiones: emitir, validar (validación dual de SPEC-01) y revocar JWT
@Injectable()
export class SessionService {
  private readonly chain: readonly AccessTokenCheck[];

  constructor(
    private readonly tokenService: TokenService,
    private readonly revokedTokens: RevokedTokensRepository,
    signatureCheck: SignatureCheck,
    revocationCheck: RevocationCheck,
    tokensValidAfterCheck: TokensValidAfterCheck,
    activeAccountCheck: ActiveAccountCheck,
  ) {
    // Orden de la cadena: de la regla más barata a la que consulta la base de datos
    this.chain = [signatureCheck, revocationCheck, tokensValidAfterCheck, activeAccountCheck];
  }

  get ttlSeconds(): number {
    return this.tokenService.ttlSeconds;
  }

  issueAccessToken(user: UserEntity): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    return this.tokenService.sign(buildJwtPayload(user, issuedAt, this.tokenService.ttlSeconds));
  }

  async validate(token: string): Promise<ValidatedSession> {
    const context: AccessTokenContext = { token, payload: null, user: null };
    for (const check of this.chain) {
      await check.check(context);
    }
    if (!context.payload || !context.user) {
      throw new UnauthorizedException(AUTH_MESSAGES.INVALID_TOKEN);
    }
    return { payload: context.payload, user: context.user };
  }

  // Guarda el hash hasta que el token expire. Idempotente.
  async revoke(token: string): Promise<void> {
    const payload = this.tokenService.verify(token);
    if (!payload) {
      throw new UnauthorizedException(AUTH_MESSAGES.INVALID_TOKEN);
    }
    await this.revokedTokens.revoke(hashToken(token), payload.sub, new Date(payload.exp * 1000));
    await this.revokedTokens.purgeExpired();
  }
}
