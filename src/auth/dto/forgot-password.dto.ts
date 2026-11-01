import { IsEmail, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  INSTITUTIONAL_EMAIL_MESSAGE,
  INSTITUTIONAL_EMAIL_REGEX,
  normalizeEmail,
} from './auth-validation.constants';

export class ForgotPasswordDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Formato de correo no válido' })
  @Matches(INSTITUTIONAL_EMAIL_REGEX, { message: INSTITUTIONAL_EMAIL_MESSAGE })
  email!: string;
}
