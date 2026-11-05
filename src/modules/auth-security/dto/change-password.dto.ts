import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Contraseña actual del usuario' })
  @IsString()
  @IsNotEmpty({ message: 'Debes ingresar tu contraseña actual' })
  current_password?: string;

  @IsString()
  @IsNotEmpty()
  currentPassword?: string;

  @ApiProperty({ description: 'Nueva contraseña (mínimo 10 caracteres)' })
  @IsString()
  @MinLength(10, { message: 'La nueva contraseña debe tener por lo menos 10 caracteres' })
  password?: string;

  @IsString()
  @MinLength(10)
  newPassword?: string;
}

