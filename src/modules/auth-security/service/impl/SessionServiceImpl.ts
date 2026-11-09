import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { SessionService, ValidatedSession } from '../SessionService';
import { TokenService } from '../../token/TokenService';
import { buildJwtPayload } from '../../token/JwtPayload';
import { hashToken } from '../../token/TokenHash';
import { RevokedTokensRepository } from '../../repository/RevokedTokensRepository';
import { AccessTokenCheck, AccessTokenContext } from '../../chain/AccessTokenCheck';
import { UserEntity } from '../../entities/user.entity';
import { AuthException } from '../../exception/AuthException';
import { ACCESS_TOKEN_CHECKS, AUTH_MESSAGES } from '../../auth.constants';

// La cadena llega armada desde AuthModule (OCP): agregar un check no obliga a tocar este servicio
@Injectable()
export class SessionServiceImpl extends SessionService {
  constructor(
    private readonly tokenService: TokenService,
    private readonly revokedTokens: RevokedTokensRepository,
    @Inject(ACCESS_TOKEN_CHECKS)
    private readonly chain: readonly AccessTokenCheck[],
  ) {
    super();
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
      throw new AuthException(AUTH_MESSAGES.INVALID_TOKEN, HttpStatus.UNAUTHORIZED);
    }
    return { payload: context.payload, user: context.user };
  }

  async revoke(token: string): Promise<void> {
    const payload = this.tokenService.verify(token);
    if (!payload) {
      throw new AuthException(AUTH_MESSAGES.INVALID_TOKEN, HttpStatus.UNAUTHORIZED);
    }
    await this.revokedTokens.revoke(hashToken(token), payload.sub, new Date(payload.exp * 1000));
    await this.revokedTokens.purgeExpired();
  }
}
