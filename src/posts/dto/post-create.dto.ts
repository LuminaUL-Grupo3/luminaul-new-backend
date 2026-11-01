import {
  IsUUID,
  IsString,
  MaxLength,
  IsIn,
  IsOptional,
  Validate,
  ValidateIf,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ALLOWED_POST_TYPES = ['study_group', 'tutoring'] as const;
export type AllowedPostType = (typeof ALLOWED_POST_TYPES)[number];

@ValidatorConstraint({ name: 'isNotBlank', async: false })
export class IsNotBlankConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'description cannot be empty';
  }
}

export class PostCreateDto {
  @ApiPropertyOptional({
    description: 'UUID del curso asociado (snake_case)',
    example: '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
  })
  @ValidateIf((o) => !o.courseId)
  @IsUUID(undefined, { message: 'course_id must be a valid UUID' })
  course_id?: string;

  @ApiPropertyOptional({
    description: 'UUID del curso asociado (camelCase)',
    example: '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
  })
  @ValidateIf((o) => !o.course_id)
  @IsUUID(undefined, { message: 'courseId must be a valid UUID' })
  courseId?: string;

  @ApiProperty({
    description: 'Tipo de publicación: study_group o tutoring',
    enum: ALLOWED_POST_TYPES,
    example: 'study_group',
  })
  @IsString()
  @MaxLength(50)
  @IsIn(ALLOWED_POST_TYPES, {
    message: 'type must be tutoring or study_group',
  })
  type!: string;

  @ApiProperty({
    description: 'Descripción de la publicación',
    example: 'Buscamos integrantes para repasar antes de la PC1',
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Validate(IsNotBlankConstraint)
  description!: string;

  @ApiPropertyOptional({
    description: 'Beneficios del grupo o tutoría',
    example: 'Ejercicios resueltos y asesorías',
  })
  @IsOptional()
  @IsString()
  benefits?: string;

  @ApiPropertyOptional({
    description: 'Requisitos para unirse',
    example: 'Haber aprobado cursos previos',
  })
  @IsOptional()
  @IsString()
  requirements?: string;

  @ApiPropertyOptional({
    description: 'ID de un grupo ya existente para vincular (snake_case)',
    example: '7b134111-9a22-48df-9fa0-cd8213aa0981',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'group_id must be a valid UUID' })
  group_id?: string;

  @ApiPropertyOptional({
    description: 'ID de un grupo ya existente para vincular (camelCase)',
    example: '7b134111-9a22-48df-9fa0-cd8213aa0981',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'groupId must be a valid UUID' })
  groupId?: string;

  @ApiPropertyOptional({
    description: 'Capacidad máxima de miembros (1 a 50)',
    example: 5,
    default: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxCapacity?: number;

  @ApiPropertyOptional({
    description: 'Capacidad máxima de miembros (snake_case)',
    example: 5,
    default: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  max_capacity?: number;

  static getCourseId(dto: PostCreateDto): string {
    return dto.courseId || dto.course_id || '';
  }

  static getGroupId(dto: PostCreateDto): string | undefined {
    return dto.groupId || dto.group_id;
  }

  static getMaxCapacity(dto: PostCreateDto): number {
    return dto.maxCapacity ?? dto.max_capacity ?? 5;
  }
}
