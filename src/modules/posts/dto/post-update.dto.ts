import { POST_COLORS } from '../post-colors';
import { ValidateIf } from 'class-validator';
import {
  IsUUID,
  IsIn,
  IsString,
  IsOptional,
  Validate,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotBlankConstraint } from './post-create.dto';

// courseId y type son inmutables tras crear la publicación y no forman parte del DTO de edición
export class PostUpdateDto {
  @ApiPropertyOptional({ enum: POST_COLORS, default: 'white' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(POST_COLORS)
  color?: string;

  @ApiPropertyOptional({ description: 'Descripción de la publicación' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Validate(IsNotBlankConstraint)
  @MaxLength(500, { message: 'description must not exceed 500 characters' })
  description?: string;

  @ApiPropertyOptional({ description: 'Beneficios del grupo o tutoría' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'benefits must not exceed 100 characters' })
  benefits?: string;

  @ApiPropertyOptional({ description: 'Requisitos para unirse' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'requirements must not exceed 100 characters' })
  requirements?: string;

  @ApiPropertyOptional({ description: 'Capacidad máxima de miembros (1 a 50)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxCapacity?: number;

  @ApiPropertyOptional({ description: 'ID del grupo de estudio asociado' })
  @IsOptional()
  @IsUUID(undefined, { message: 'groupId must be a valid UUID' })
  groupId?: string;
}
