import { IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  INSTITUTIONAL_EMAIL_MESSAGE,
  INSTITUTIONAL_EMAIL_REGEX,
  OTP_DIGITS_MESSAGE,
  OTP_MESSAGE,
  OTP_REGEX,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_LENGTH_MESSAGE,
  normalizeEmail,
  trimString,
} from './auth-validation.constants';

export class ResetPasswordDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Formato de correo no válido' })
  @Matches(INSTITUTIONAL_EMAIL_REGEX, { message: INSTITUTIONAL_EMAIL_MESSAGE })
  email!: string;

  @ApiProperty({ example: '492018', minLength: 6, maxLength: 6 })
  @Transform(trimString)
  @IsString()
  @Length(6, 6, { message: OTP_MESSAGE })
  @Matches(OTP_REGEX, { message: OTP_DIGITS_MESSAGE })
  token!: string;

  @ApiProperty({ example: 'NuevaPassword456!', minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE })
  newPassword!: string;
}
