import { POST_COLORS } from '../post-colors';
import { IsBoundedInt } from '../validator/PostValidators';
import { ValidateIf } from 'class-validator';
import {
  IsUUID,
  IsIn,
  IsString,
  IsOptional,
  Validate,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotBlankConstraint } from './post-create.dto';

// courseId y type son inmutables tras crear la publicación y no forman parte del DTO de edición
export class PostUpdateDto {
  @ApiPropertyOptional({ enum: POST_COLORS, default: 'white' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(POST_COLORS, { message: 'El color seleccionado no es válido' })
  color?: string;

  @ApiPropertyOptional({ description: 'Descripción de la publicación' })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Validate(IsNotBlankConstraint)
  @MaxLength(500, { message: 'La descripción no puede superar los 500 caracteres' })
  description?: string;

  @ApiPropertyOptional({ description: 'Beneficios del grupo o tutoría' })
  @IsOptional()
  @IsString({ message: 'Los beneficios deben ser texto' })
  @MaxLength(100, { message: 'Los beneficios no pueden superar los 100 caracteres' })
  benefits?: string;

  @ApiPropertyOptional({ description: 'Requisitos para unirse' })
  @IsOptional()
  @IsString({ message: 'Los requisitos deben ser texto' })
  @MaxLength(100, { message: 'Los requisitos no pueden superar los 100 caracteres' })
  requirements?: string;

  @ApiPropertyOptional({ description: 'Capacidad máxima de miembros (2 a 8)' })
  @IsOptional()
  @IsBoundedInt('maxCapacity', 2, 8)
  maxCapacity?: number;

  @ApiPropertyOptional({ description: 'ID del grupo de estudio asociado' })
  @IsOptional()
  @IsUUID(undefined, { message: 'groupId debe ser un UUID válido' })
  groupId?: string;
}
