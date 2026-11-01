import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmail } from './auth-validation.constants';

export class ResendCodeDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Formato de correo no válido' })
  email!: string;
}
