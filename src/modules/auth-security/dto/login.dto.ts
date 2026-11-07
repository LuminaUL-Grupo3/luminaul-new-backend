import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  EMAIL_FORMAT_MESSAGE,
  IsRequiredText,
  PASSWORD_REQUIRED_MESSAGE,
  normalizeEmail,
} from './auth-validation.constants';

export class LoginDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: EMAIL_FORMAT_MESSAGE })
  email!: string;

  // Sin la política de contraseña nueva: el login debe aceptar cualquier contraseña ya guardada
  @ApiProperty({ example: 'PasswordSegura123!' })
  @IsRequiredText(PASSWORD_REQUIRED_MESSAGE)
  password!: string;
}
