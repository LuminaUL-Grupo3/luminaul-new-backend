import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export const DAYS_OF_WEEK = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;

const START_TIME_PATTERN = /^(0[7-9]|1\d|2[0-1]):([0-5]\d)$/;
const END_TIME_PATTERN = /^(0[7-9]|1\d|2[0-2]):([0-5]\d)$/;
const INVALID_DAY = 'Día inválido';
const INVALID_START = 'La hora de inicio debe estar entre 07:00 y 21:59';
const INVALID_END = 'La hora de fin debe estar entre 07:01 y 22:00';

export class CreateAvailabilityDto {
  @ApiProperty({ enum: DAYS_OF_WEEK })
  @IsString()
  @IsIn(DAYS_OF_WEEK, { message: INVALID_DAY })
  dayOfWeek!: string;

  @ApiProperty({ example: '14:00' })
  @IsString()
  @Matches(START_TIME_PATTERN, { message: INVALID_START })
  startTime!: string;

  @ApiProperty({ example: '16:00' })
  @IsString()
  @Matches(END_TIME_PATTERN, { message: INVALID_END })
  endTime!: string;
}

export class UpdateAvailabilityDto {
  @ApiPropertyOptional({ enum: DAYS_OF_WEEK })
  @IsOptional()
  @IsString()
  @IsIn(DAYS_OF_WEEK, { message: INVALID_DAY })
  dayOfWeek?: string;

  @ApiPropertyOptional({ example: '14:00' })
  @IsOptional()
  @IsString()
  @Matches(START_TIME_PATTERN, { message: INVALID_START })
  startTime?: string;

  @ApiPropertyOptional({ example: '16:00' })
  @IsOptional()
  @IsString()
  @Matches(END_TIME_PATTERN, { message: INVALID_END })
  endTime?: string;
}
