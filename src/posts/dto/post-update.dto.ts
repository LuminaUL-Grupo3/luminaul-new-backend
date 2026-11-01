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
    description: 'UUID del curso asociado (snake_case)',
    example: '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'course_id must be a valid UUID' })
  course_id?: string;

  @ApiPropertyOptional({
    description: 'UUID del curso asociado (camelCase)',
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

  @ApiPropertyOptional({ description: 'Capacidad máxima de miembros (snake_case)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  max_capacity?: number;

  static getCourseId(dto: PostUpdateDto): string | undefined {
    return dto.courseId || dto.course_id;
  }

  static getMaxCapacity(dto: PostUpdateDto): number | undefined {
    return dto.maxCapacity ?? dto.max_capacity;
  }
}
