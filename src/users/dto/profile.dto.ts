import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ minLength: 2, maxLength: 100 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(2, 100)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1500 })
  @IsOptional() @IsString() @MaxLength(1500)
  bio?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional() @IsString() @MaxLength(100)
  major?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, nullable: true })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10)
  academic_cycle?: number | null;

  @ApiPropertyOptional({ type: [String], maxItems: 15 })
  @Transform(({ value }) => Array.isArray(value) ? value.map(v => typeof v === 'string' ? v.trim() : v) : value)
  @IsOptional() @IsArray() @ArrayMaxSize(15) @ArrayUnique() @IsString({ each: true }) @Length(1, 100, { each: true })
  skills?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 15 })
  @Transform(({ value }) => Array.isArray(value) ? value.map(v => typeof v === 'string' ? v.trim() : v) : value)
  @IsOptional() @IsArray() @ArrayMaxSize(15) @ArrayUnique() @IsString({ each: true }) @Length(1, 100, { each: true })
  interests?: string[];
}

export class AvailabilityDto {
  @ApiProperty({ minimum: 1, maximum: 7, description: 'Lunes = 1, domingo = 7' })
  @Type(() => Number) @IsInt() @Min(1) @Max(7)
  day_of_week!: number;

  @ApiProperty({ example: '09:00' })
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/, { message: 'La hora de inicio debe tener formato HH:mm.' })
  start_time!: string;

  @ApiProperty({ example: '11:00' })
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/, { message: 'La hora de fin debe tener formato HH:mm.' })
  end_time!: string;
}
