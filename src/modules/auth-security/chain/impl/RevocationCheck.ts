import { HttpStatus, Injectable } from '@nestjs/common';
import { AccessTokenCheck, AccessTokenContext } from '../AccessTokenCheck';
import { RevokedTokensRepository } from '../../repository/RevokedTokensRepository';
import { hashToken } from '../../token/TokenHash';
import { AuthException } from '../../exception/AuthException';
import { AUTH_MESSAGES } from '../../auth.constants';

// 2. El token no fue revocado por un logout
@Injectable()
export class RevocationCheck extends AccessTokenCheck {
  constructor(private readonly revokedTokens: RevokedTokensRepository) {
    super();
  }

  async check(context: AccessTokenContext): Promise<void> {
    if (await this.revokedTokens.isRevoked(hashToken(context.token))) {
      throw new AuthException(AUTH_MESSAGES.SESSION_CLOSED, HttpStatus.UNAUTHORIZED);
    }
  }
}
