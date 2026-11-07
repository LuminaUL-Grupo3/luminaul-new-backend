import { IsEmail, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  EMAIL_FORMAT_MESSAGE,
  INSTITUTIONAL_EMAIL_MESSAGE,
  INSTITUTIONAL_EMAIL_REGEX,
  IsNewPassword,
  IsRequiredText,
  NAME_REQUIRED_MESSAGE,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
  trimString,
} from './auth-validation.constants';

export class RegisterDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: EMAIL_FORMAT_MESSAGE })
  @Matches(INSTITUTIONAL_EMAIL_REGEX, { message: INSTITUTIONAL_EMAIL_MESSAGE })
  email!: string;

  @ApiProperty({
    example: 'PasswordSegura123!',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_BYTES,
  })
  @IsNewPassword()
  password!: string;

  @ApiProperty({ example: 'Martín Vizcarra', maxLength: 150 })
  @Transform(trimString)
  @IsRequiredText(NAME_REQUIRED_MESSAGE)
  @MaxLength(150, { message: 'El nombre no puede superar los 150 caracteres' })
  name!: string;
}
