import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { EMAIL_FORMAT_MESSAGE, normalizeEmail } from './auth-validation.constants';

export class ResendCodeDto {
  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: EMAIL_FORMAT_MESSAGE })
  email!: string;
}
