import { IsEmail, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmail, trimString } from '../validator/AuthValidators';
import { AUTH_LIMITS, AUTH_PATTERNS, AUTH_VALIDATION_MESSAGES } from '../auth.constants';

export class VerifyEmailDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: AUTH_VALIDATION_MESSAGES.EMAIL_FORMAT })
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
}
