import { HttpStatus, Injectable, InternalServerErrorException } from '@nestjs/common';
import { AccessTokenCheck, AccessTokenContext } from '../AccessTokenCheck';
import { UsersRepository } from '../../repository/UsersRepository';
import { JwtPayload } from '../../token/JwtPayload';
import { AuthException } from '../../exception/AuthException';
import { AUTH_MESSAGES } from '../../auth.constants';

// 3. El token se emitió después de tokens_valid_after (reset, borrado o suspensión)
@Injectable()
export class TokensValidAfterCheck extends AccessTokenCheck {
  constructor(private readonly users: UsersRepository) {
    super();
  }

  async check(context: AccessTokenContext): Promise<void> {
    const payload = this.requirePayload(context);
    const user = await this.users.findById(payload.sub);
    // Sin iat no hay forma de comparar con tokens_valid_after: se rechaza
    if (!user || typeof payload.iat !== 'number') {
      throw new AuthException(AUTH_MESSAGES.SESSION_INVALIDATED, HttpStatus.UNAUTHORIZED);
    }
    // iat está en segundos: se compara contra tokens_valid_after truncado al segundo para no
    // rechazar un login hecho en el mismo segundo en que se invalidaron las sesiones
    const validAfterSeconds = Math.floor(user.tokensValidAfter.getTime() / 1000);
    if (payload.iat < validAfterSeconds) {
      throw new AuthException(AUTH_MESSAGES.SESSION_INVALIDATED, HttpStatus.UNAUTHORIZED);
    }
    context.user = user;
  }

  // Este eslabón necesita el payload que deja SignatureCheck
  private requirePayload(context: AccessTokenContext): JwtPayload {
    if (!context.payload) {
      throw new InternalServerErrorException('La cadena de validación del token está mal ordenada');
    }
    return context.payload;
  }
}
