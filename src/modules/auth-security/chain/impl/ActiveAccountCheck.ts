import { HttpStatus, Injectable } from '@nestjs/common';
import { AccessTokenCheck, AccessTokenContext } from '../AccessTokenCheck';
import { UserAccountStatus } from '../../enums/UserAccountStatus';
import { AuthException } from '../../exception/AuthException';
import { AUTH_MESSAGES } from '../../auth.constants';

// 4. La cuenta sigue activa
@Injectable()
export class ActiveAccountCheck extends AccessTokenCheck {
  async check(context: AccessTokenContext): Promise<void> {
    if (context.user?.status !== UserAccountStatus.ACTIVE) {
      throw new AuthException(AUTH_MESSAGES.SESSION_INVALIDATED, HttpStatus.UNAUTHORIZED);
    }
  }
}
