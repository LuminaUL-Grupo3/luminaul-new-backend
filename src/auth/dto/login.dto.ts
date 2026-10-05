import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength, Matches, IsByteLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'usuario@aloe.ulima.edu.pe' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  @Matches(/^[^@\s]+@(aloe\.)?ulima\.edu\.pe$/i, { message: 'Usa tu correo institucional de la Universidad de Lima' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(1, { message: 'Ingresa tu contraseña' })
  @MaxLength(72)
  @IsByteLength(1, 72, { message: 'La contraseña supera el límite permitido' })
  password!: string;
}
