import {
  IsUUID,
  IsString,
  IsOptional,
  Validate,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotBlankConstraint } from './post-create.dto';

// courseId y type son inmutables tras crear la publicación y no forman parte del DTO de edición
export class PostUpdateDto {
  @ApiPropertyOptional({ description: 'Descripción de la publicación' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Validate(IsNotBlankConstraint)
  description?: string;

  @ApiPropertyOptional({ description: 'Beneficios del grupo o tutoría' })
  @IsOptional()
  @IsString()
  benefits?: string;

  @ApiPropertyOptional({ description: 'Requisitos para unirse' })
  @IsOptional()
  @IsString()
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
