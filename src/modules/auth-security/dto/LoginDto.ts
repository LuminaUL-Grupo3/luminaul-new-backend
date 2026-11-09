import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsRequiredText, normalizeEmail } from '../validator/AuthValidators';
import { AUTH_VALIDATION_MESSAGES } from '../auth.constants';

export class LoginDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: AUTH_VALIDATION_MESSAGES.EMAIL_FORMAT })
  email!: string;

  // Sin la política de contraseña nueva: el login debe aceptar cualquier contraseña ya guardada
  @ApiProperty({ example: 'PasswordSegura123!' })
  @IsRequiredText(AUTH_VALIDATION_MESSAGES.PASSWORD_REQUIRED)
  password!: string;
}
