import {
  IsUUID,
  IsString,
  MaxLength,
  IsIn,
  IsOptional,
  Validate,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ALLOWED_POST_TYPES, IsNotBlankConstraint } from './post-create.dto';

export class PostUpdateDto {
  @ApiPropertyOptional({
    description: 'UUID del curso asociado',
    example: '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'courseId must be a valid UUID' })
  courseId?: string;

  @ApiPropertyOptional({
    description: 'Tipo de publicación: study_group o tutoring',
    enum: ALLOWED_POST_TYPES,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @IsIn(ALLOWED_POST_TYPES, {
    message: 'type must be tutoring or study_group',
  })
  type?: string;

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
