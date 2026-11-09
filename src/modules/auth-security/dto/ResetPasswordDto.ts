import { IsEmail, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsNewPassword, normalizeEmail, trimString } from '../validator/AuthValidators';
import { AUTH_LIMITS, AUTH_PATTERNS, AUTH_VALIDATION_MESSAGES } from '../auth.constants';

export class ResetPasswordDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: AUTH_VALIDATION_MESSAGES.EMAIL_FORMAT })
  @Matches(AUTH_PATTERNS.INSTITUTIONAL_EMAIL, {
    message: AUTH_VALIDATION_MESSAGES.INSTITUTIONAL_EMAIL,
  })
  email!: string;

  @ApiProperty({
    example: '492018',
    minLength: AUTH_LIMITS.OTP_LENGTH,
    maxLength: AUTH_LIMITS.OTP_LENGTH,
  })
  @Transform(trimString)
  @Length(AUTH_LIMITS.OTP_LENGTH, AUTH_LIMITS.OTP_LENGTH, {
    message: AUTH_VALIDATION_MESSAGES.OTP_LENGTH,
  })
  @Matches(AUTH_PATTERNS.OTP_DIGITS, { message: AUTH_VALIDATION_MESSAGES.OTP_DIGITS })
  token!: string;

  @ApiProperty({
    example: 'NuevaPassword456!',
    minLength: AUTH_LIMITS.PASSWORD_MIN_LENGTH,
    maxLength: AUTH_LIMITS.PASSWORD_MAX_BYTES,
  })
  @IsNewPassword(AUTH_VALIDATION_MESSAGES.NEW_PASSWORD_REQUIRED)
  newPassword!: string;
}
