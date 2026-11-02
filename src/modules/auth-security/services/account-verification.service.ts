import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import { OneTimeCodePurpose, OneTimeCodeService } from './one-time-code.service';
import { MailSender } from '../providers/mail-sender';
import { UserAccountStatus } from '../enums/user-account-status.enum';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { ResendCodeDto } from '../dto/resend-code.dto';
import { MessageResponseDto, VerifyEmailResponseDto } from '../dto/auth-response.dto';
import { AUTH_MESSAGES } from '../auth.constants';

// Verificación del correo institucional con OTP de 6 dígitos
@Injectable()
export class AccountVerificationService {
  constructor(
    private readonly users: UsersRepository,
    private readonly oneTimeCodes: OneTimeCodeService,
    private readonly mailSender: MailSender,
  ) {}

  async verifyEmail(dto: VerifyEmailDto): Promise<VerifyEmailResponseDto> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      throw new BadRequestException(AUTH_MESSAGES.INVALID_CODE);
    }
    if (user.status === UserAccountStatus.ACTIVE && user.isVerified) {
      throw new BadRequestException(AUTH_MESSAGES.ALREADY_VERIFIED);
    }
    // Una cuenta suspendida o borrada no puede reactivarse con un código
    if (user.status !== UserAccountStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(AUTH_MESSAGES.INVALID_CODE);
    }

    this.oneTimeCodes.consume(user, OneTimeCodePurpose.EMAIL_VERIFICATION, dto.token);
    user.isVerified = true;
    user.status = UserAccountStatus.ACTIVE;
    await this.users.save(user);

    return { message: AUTH_MESSAGES.EMAIL_VERIFIED, isVerified: true };
  }

  // Respuesta idéntica exista o no la cuenta, para no revelar qué correos están registrados
  async resendCode(dto: ResendCodeDto): Promise<MessageResponseDto> {
    const user = await this.users.findByEmail(dto.email);
    if (user?.status === UserAccountStatus.PENDING_VERIFICATION) {
      const issued = this.oneTimeCodes.issue(user, OneTimeCodePurpose.EMAIL_VERIFICATION);
      await this.users.save(user);
      await this.mailSender.sendVerificationCode({ to: user.email, name: user.name, ...issued });
    }
    return { message: AUTH_MESSAGES.CODE_RESENT };
  }
}
