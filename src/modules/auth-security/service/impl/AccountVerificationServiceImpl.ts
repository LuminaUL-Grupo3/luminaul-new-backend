import { Injectable } from '@nestjs/common';
import { AccountVerificationService } from '../AccountVerificationService';
import { OneTimeCodeService } from '../OneTimeCodeService';
import { UsersRepository } from '../../repository/UsersRepository';
import { MailSender } from '../../mail/MailSender';
import { UserAccountStatus } from '../../enums/UserAccountStatus';
import { OneTimeCodePurpose } from '../../enums/OneTimeCodePurpose';
import { AuthException } from '../../exception/AuthException';
import { VerifyEmailDto } from '../../dto/VerifyEmailDto';
import { ResendCodeDto } from '../../dto/ResendCodeDto';
import { MessageResponseDto } from '../../dto/MessageResponseDto';
import { VerifyEmailResponseDto } from '../../dto/VerifyEmailResponseDto';
import { AUTH_MESSAGES } from '../../auth.constants';

@Injectable()
export class AccountVerificationServiceImpl extends AccountVerificationService {
  constructor(
    private readonly users: UsersRepository,
    private readonly oneTimeCodes: OneTimeCodeService,
    private readonly mailSender: MailSender,
  ) {
    super();
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<VerifyEmailResponseDto> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      throw new AuthException(AUTH_MESSAGES.INVALID_CODE);
    }
    if (user.status === UserAccountStatus.ACTIVE && user.isVerified) {
      throw new AuthException(AUTH_MESSAGES.ALREADY_VERIFIED);
    }
    // Una cuenta suspendida o borrada no puede reactivarse con un código
    if (user.status !== UserAccountStatus.PENDING_VERIFICATION) {
      throw new AuthException(AUTH_MESSAGES.INVALID_CODE);
    }

    this.oneTimeCodes.consume(user, OneTimeCodePurpose.EMAIL_VERIFICATION, dto.token);
    user.isVerified = true;
    user.status = UserAccountStatus.ACTIVE;
    await this.users.save(user);

    return { message: AUTH_MESSAGES.EMAIL_VERIFIED, isVerified: true };
  }

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
