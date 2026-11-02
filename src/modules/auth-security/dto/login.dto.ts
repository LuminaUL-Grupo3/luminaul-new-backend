import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmail } from './auth-validation.constants';

export class LoginDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Formato de correo no válido' })
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'PasswordSegura123!' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña no puede estar vacía' })
  password!: string;
}
