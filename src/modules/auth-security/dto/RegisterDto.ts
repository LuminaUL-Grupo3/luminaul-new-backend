import { IsEmail, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsFullName,
  IsNewPassword,
  normalizeEmail,
  trimString,
} from '../validator/AuthValidators';
import { AUTH_LIMITS, AUTH_PATTERNS, AUTH_VALIDATION_MESSAGES } from '../auth.constants';

export class RegisterDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: AUTH_VALIDATION_MESSAGES.EMAIL_FORMAT })
  @Matches(AUTH_PATTERNS.INSTITUTIONAL_EMAIL, {
    message: AUTH_VALIDATION_MESSAGES.INSTITUTIONAL_EMAIL,
  })
  email!: string;

  @ApiProperty({
    example: 'PasswordSegura123!',
    minLength: AUTH_LIMITS.PASSWORD_MIN_LENGTH,
    maxLength: AUTH_LIMITS.PASSWORD_MAX_BYTES,
  })
  @IsNewPassword()
  password!: string;

  @ApiProperty({ example: 'Martín Vizcarra', maxLength: AUTH_LIMITS.NAME_MAX_LENGTH })
  @Transform(trimString)
  @IsFullName()
  name!: string;
}
