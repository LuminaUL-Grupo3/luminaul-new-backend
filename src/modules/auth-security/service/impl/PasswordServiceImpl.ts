import { HttpStatus, Injectable } from '@nestjs/common';
import { PasswordService } from '../PasswordService';
import { OneTimeCodeService } from '../OneTimeCodeService';
import { UsersRepository } from '../../repository/UsersRepository';
import { PasswordHasher } from '../../strategy/PasswordHasher';
import { MailSender } from '../../mail/MailSender';
import { isRecoverable } from '../../policy/PasswordRecoveryPolicy';
import { OneTimeCodePurpose } from '../../enums/OneTimeCodePurpose';
import { AuthException } from '../../exception/AuthException';
import { ForgotPasswordDto } from '../../dto/ForgotPasswordDto';
import { ResetPasswordDto } from '../../dto/ResetPasswordDto';
import { ChangePasswordDto } from '../../dto/ChangePasswordDto';
import { MessageResponseDto } from '../../dto/MessageResponseDto';
import { AUTH_MESSAGES } from '../../auth.constants';

@Injectable()
export class PasswordServiceImpl extends PasswordService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly oneTimeCodes: OneTimeCodeService,
    private readonly mailSender: MailSender,
  ) {
    super();
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    const user = await this.users.findByEmail(dto.email);
    if (isRecoverable(user)) {
      const issued = this.oneTimeCodes.issue(user, OneTimeCodePurpose.PASSWORD_RESET);
      await this.users.save(user);
      await this.mailSender.sendPasswordResetCode({ to: user.email, name: user.name, ...issued });
    }
    return { message: AUTH_MESSAGES.RESET_CODE_SENT };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<MessageResponseDto> {
    const user = await this.users.findByEmail(dto.email);
    if (!isRecoverable(user)) {
      throw new AuthException(AUTH_MESSAGES.INVALID_CODE);
    }

    this.oneTimeCodes.consume(user, OneTimeCodePurpose.PASSWORD_RESET, dto.token);
    user.passwordHash = await this.passwordHasher.hash(dto.newPassword);
    // Invalida todas las sesiones abiertas con la contraseña anterior
    user.tokensValidAfter = new Date();
    await this.users.save(user);

    return { message: AUTH_MESSAGES.PASSWORD_RESET };
  }

  // El formato de la nueva contraseña ya lo validó ChangePasswordDto
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<MessageResponseDto> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AuthException(AUTH_MESSAGES.SESSION_INVALIDATED, HttpStatus.UNAUTHORIZED);
    }
    if (!(await this.passwordHasher.compare(dto.currentPassword, user.passwordHash))) {
      throw new AuthException(AUTH_MESSAGES.WRONG_CURRENT_PASSWORD);
    }
    // Ya se comprobó que currentPassword es la contraseña vigente, basta compararlas en claro
    if (dto.password === dto.currentPassword) {
      throw new AuthException(AUTH_MESSAGES.SAME_PASSWORD);
    }

    user.passwordHash = await this.passwordHasher.hash(dto.password);
    // Igual que en el restablecimiento: se cierran todas las sesiones, incluida la actual
    user.tokensValidAfter = new Date();
    await this.users.save(user);
    return { message: AUTH_MESSAGES.PASSWORD_CHANGED };
  }
}
