import { IsUUID, IsString, MaxLength, IsIn, IsOptional, Validate } from 'class-validator';
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
  @ApiProperty({ description: 'UUID del curso asociado', example: '299f1957-e662-4591-b698-a19ac3541214' })
  @IsUUID(undefined, { message: 'course_id must be a valid UUID' })
  course_id!: string;

  @ApiProperty({ description: 'Tipo de publicación: study_group o tutoring', enum: ALLOWED_POST_TYPES, example: 'study_group' })
  @IsString()
  @MaxLength(50)
  @IsIn(ALLOWED_POST_TYPES, {
    message: 'type must be tutoring or study_group',
  })
  type!: string;

  @ApiProperty({ description: 'Descripción de la publicación', example: 'Grupo para repasar antes de la PC1' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Validate(IsNotBlankConstraint)
  description!: string;

  @ApiPropertyOptional({ description: 'Beneficios del grupo o tutoría', example: 'Ejercicios tipo examen' })
  @IsOptional()
  @IsString()
  benefits?: string;

  @ApiPropertyOptional({ description: 'Requisitos para unirse', example: 'Tener instaladas las herramientas' })
  @IsOptional()
  @IsString()
  requirements?: string;

  @ApiPropertyOptional({ description: 'ID de un grupo ya existente para vincular la publicación (opcional)', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsUUID(undefined, { message: 'group_id must be a valid UUID' })
  group_id?: string;
}
