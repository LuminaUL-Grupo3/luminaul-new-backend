import { IsEmail, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  EMAIL_FORMAT_MESSAGE,
  INSTITUTIONAL_EMAIL_MESSAGE,
  INSTITUTIONAL_EMAIL_REGEX,
  IsNewPassword,
  NEW_PASSWORD_REQUIRED_MESSAGE,
  OTP_DIGITS_MESSAGE,
  OTP_MESSAGE,
  OTP_REGEX,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
  trimString,
} from './auth-validation.constants';

export class ResetPasswordDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: EMAIL_FORMAT_MESSAGE })
  @Matches(INSTITUTIONAL_EMAIL_REGEX, { message: INSTITUTIONAL_EMAIL_MESSAGE })
  email!: string;

  @ApiProperty({ example: '492018', minLength: 6, maxLength: 6 })
  @Transform(trimString)
  @Length(6, 6, { message: OTP_MESSAGE })
  @Matches(OTP_REGEX, { message: OTP_DIGITS_MESSAGE })
  token!: string;

  @ApiProperty({
    example: 'NuevaPassword456!',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_BYTES,
  })
  @IsNewPassword(NEW_PASSWORD_REQUIRED_MESSAGE)
  newPassword!: string;
}
