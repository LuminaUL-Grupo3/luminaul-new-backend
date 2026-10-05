import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsByteLength, IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class InstitutionalEmailDto {
  @ApiProperty({ example: 'estudiante@aloe.ulima.edu.pe' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  @Matches(/^[^@\s]+@(aloe\.)?ulima\.edu\.pe$/i, { message: 'Usa tu correo institucional de la Universidad de Lima' })
  @MaxLength(255)
  email!: string;
}

export class NewPasswordDto {
  @ApiProperty({ writeOnly: true, minLength: 10, maxLength: 72 })
  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres' })
  @IsByteLength(10, 72, { message: 'La contraseña debe tener entre 10 y 72 bytes' })
  password!: string;
}

export class RegisterDto extends InstitutionalEmailDto {
  @ApiProperty()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(2, 100, { message: 'El nombre debe tener entre 2 y 100 caracteres' })
  name!: string;

  @ApiProperty({ writeOnly: true, minLength: 10, maxLength: 72 })
  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres' })
  @IsByteLength(10, 72)
  password!: string;
}

export class VerifyEmailDto extends InstitutionalEmailDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Ingresa el código de seis dígitos' })
  code!: string;
}

export class ResetPasswordDto extends NewPasswordDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'El enlace de recuperación no es válido' })
  token!: string;
}

export class ChangePasswordDto extends NewPasswordDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(1)
  @IsByteLength(1, 72)
  current_password!: string;
}
