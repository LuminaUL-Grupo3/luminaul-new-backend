import { HttpStatus, Injectable } from '@nestjs/common';
import { AccessTokenCheck, AccessTokenContext } from '../AccessTokenCheck';
import { TokenService } from '../../token/TokenService';
import { AuthException } from '../../exception/AuthException';
import { AUTH_MESSAGES } from '../../auth.constants';

// 1. Firma HS256 y expiración
@Injectable()
export class SignatureCheck extends AccessTokenCheck {
  constructor(private readonly tokenService: TokenService) {
    super();
  }

  async check(context: AccessTokenContext): Promise<void> {
    context.payload = this.tokenService.verify(context.token);
    if (!context.payload) {
      throw new AuthException(AUTH_MESSAGES.INVALID_TOKEN, HttpStatus.UNAUTHORIZED);
    }
  }
}
