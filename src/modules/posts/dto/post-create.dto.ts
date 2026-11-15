import { POST_COLORS } from '../post-colors';
import { POST_MESSAGES } from '../posts.constants';
import { IsBoundedInt } from '../validator/PostValidators';
import { ValidateIf } from 'class-validator';
import {
  IsUUID,
  IsString,
  MaxLength,
  IsIn,
  IsOptional,
  Validate,
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
    return POST_MESSAGES.EMPTY_DESCRIPTION;
  }
}

export class PostCreateDto {
  @ApiPropertyOptional({ enum: POST_COLORS, default: 'white' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(POST_COLORS, { message: 'El color seleccionado no es válido' })
  color?: string;

  @ApiProperty({
    description: 'UUID del curso asociado',
    example: '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
  })
  @IsUUID(undefined, { message: 'courseId debe ser un UUID válido' })
  courseId!: string;

  @ApiProperty({
    description: 'Tipo de publicación: study_group o tutoring',
    enum: ALLOWED_POST_TYPES,
    example: 'study_group',
  })
  @IsString({ message: 'type debe ser texto' })
  @MaxLength(50, { message: 'type no puede superar los 50 caracteres' })
  @IsIn(ALLOWED_POST_TYPES, {
    message: POST_MESSAGES.UNSUPPORTED_TYPE,
  })
  type!: string;

  @ApiProperty({
    description: 'Descripción de la publicación',
    example: 'Buscamos integrantes para repasar antes de la PC1',
  })
  @IsString({ message: 'La descripción debe ser texto' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Validate(IsNotBlankConstraint)
  @MaxLength(500, { message: 'La descripción no puede superar los 500 caracteres' })
  description!: string;

  @ApiPropertyOptional({
    description: 'Beneficios del grupo o tutoría',
    example: 'Ejercicios resueltos y asesorías',
  })
  @IsOptional()
  @IsString({ message: 'Los beneficios deben ser texto' })
  @MaxLength(100, { message: 'Los beneficios no pueden superar los 100 caracteres' })
  benefits?: string;

  @ApiPropertyOptional({
    description: 'Requisitos para unirse',
    example: 'Haber aprobado cursos previos',
  })
  @IsOptional()
  @IsString({ message: 'Los requisitos deben ser texto' })
  @MaxLength(100, { message: 'Los requisitos no pueden superar los 100 caracteres' })
  requirements?: string;

  @ApiPropertyOptional({
    description: 'ID de un grupo ya existente para vincular',
    example: '7b134111-9a22-48df-9fa0-cd8213aa0981',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'groupId debe ser un UUID válido' })
  groupId?: string;

  @ApiPropertyOptional({
    description: 'Capacidad máxima de miembros (1 a 50)',
    example: 5,
    default: 5,
  })
  @IsOptional()
  @IsBoundedInt('maxCapacity', 1, 50)
  maxCapacity?: number;

  @ApiPropertyOptional({
    description: 'Modalidad del grupo auto-creado',
    enum: ['presencial', 'virtual', 'hibrido'],
    default: 'virtual',
  })
  @IsOptional()
  @IsIn(['presencial', 'virtual', 'hibrido'], {
    message: 'meetingMode debe ser presencial, virtual o hibrido',
  })
  meetingMode?: 'presencial' | 'virtual' | 'hibrido';

  @ApiPropertyOptional({
    description: 'Turno preferido del grupo auto-creado',
    enum: ['manana', 'tarde', 'noche'],
    default: 'tarde',
  })
  @IsOptional()
  @IsIn(['manana', 'tarde', 'noche'], {
    message: 'meetingShift debe ser manana, tarde o noche',
  })
  meetingShift?: 'manana' | 'tarde' | 'noche';
}
