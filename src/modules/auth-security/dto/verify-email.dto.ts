import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { OTP_DIGITS_MESSAGE, OTP_MESSAGE, OTP_REGEX, normalizeEmail, trimString } from './auth-validation.constants';

export class VerifyEmailDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Formato de correo no válido' })
  email!: string;

  @ApiProperty({ example: '492018', minLength: 6, maxLength: 6 })
  @Transform(trimString)
  @IsString()
  @Length(6, 6, { message: OTP_MESSAGE })
  @Matches(OTP_REGEX, { message: OTP_DIGITS_MESSAGE })
  token!: string;
}
