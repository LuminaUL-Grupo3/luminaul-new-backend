import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import { PasswordHasher } from '../providers/password-hasher';
import { OneTimeCodePurpose, OneTimeCodeService } from './one-time-code.service';
import { MailSender } from '../providers/mail-sender';
import { UserEntity } from '../entities/user.entity';
import { UserAccountStatus } from '../enums/user-account-status.enum';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
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

  // Cambio con sesión iniciada: el formato de la nueva contraseña ya lo validó ChangePasswordDto
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<MessageResponseDto> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException(AUTH_MESSAGES.SESSION_INVALIDATED);
    }
    if (!(await this.passwordHasher.compare(dto.current_password, user.passwordHash))) {
      throw new BadRequestException(AUTH_MESSAGES.WRONG_CURRENT_PASSWORD);
    }
    // Ya se comprobó que current_password es la contraseña vigente, basta compararlas en claro
    if (dto.password === dto.current_password) {
      throw new BadRequestException(AUTH_MESSAGES.SAME_PASSWORD);
    }

    user.passwordHash = await this.passwordHasher.hash(dto.password);
    // Igual que en el restablecimiento: se cierran todas las sesiones, incluida la actual
    user.tokensValidAfter = new Date();
    await this.users.save(user);
    return { message: AUTH_MESSAGES.PASSWORD_CHANGED };
  }
}
