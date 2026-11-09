import { IsEmail, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmail } from '../validator/AuthValidators';
import { AUTH_PATTERNS, AUTH_VALIDATION_MESSAGES } from '../auth.constants';

export class ForgotPasswordDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: AUTH_VALIDATION_MESSAGES.EMAIL_FORMAT })
  @Matches(AUTH_PATTERNS.INSTITUTIONAL_EMAIL, {
    message: AUTH_VALIDATION_MESSAGES.INSTITUTIONAL_EMAIL,
  })
  email!: string;
}
