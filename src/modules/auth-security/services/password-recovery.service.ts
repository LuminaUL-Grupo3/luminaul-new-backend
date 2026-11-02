import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import { PasswordHasher } from '../providers/password-hasher';
import { OneTimeCodePurpose, OneTimeCodeService } from './one-time-code.service';
import { MailSender } from '../providers/mail-sender';
import { UserEntity } from '../entities/user.entity';
import { UserAccountStatus } from '../enums/user-account-status.enum';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { MessageResponseDto } from '../dto/auth-response.dto';
import { AUTH_MESSAGES } from '../auth.constants';

// Las cuentas suspendidas o borradas no recuperan acceso cambiando la contraseña
const RECOVERABLE_STATUSES: ReadonlySet<UserAccountStatus> = new Set([
  UserAccountStatus.ACTIVE,
  UserAccountStatus.PENDING_VERIFICATION,
]);

function isRecoverable(user: UserEntity | null): user is UserEntity {
  return user !== null && RECOVERABLE_STATUSES.has(user.status);
}

// Recuperación de contraseña con OTP de 6 dígitos
@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly oneTimeCodes: OneTimeCodeService,
    private readonly mailSender: MailSender,
  ) {}

  // Respuesta idéntica exista o no la cuenta, para no revelar qué correos están registrados
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
      throw new BadRequestException(AUTH_MESSAGES.INVALID_CODE);
    }

    this.oneTimeCodes.consume(user, OneTimeCodePurpose.PASSWORD_RESET, dto.token);
    user.passwordHash = await this.passwordHasher.hash(dto.newPassword);
    // Invalida todas las sesiones abiertas con la contraseña anterior
    user.tokensValidAfter = new Date();
    await this.users.save(user);

    return { message: AUTH_MESSAGES.PASSWORD_RESET };
  }
}
