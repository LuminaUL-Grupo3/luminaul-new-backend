import { IsOptional, IsUUID, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoundedInt } from '../validator/PostValidators';

export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Cantidad de elementos a retornar', default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsBoundedInt('limit', 1, 100)
  limit?: number = 15;

  @ApiPropertyOptional({ description: 'Desplazamiento para paginación', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsBoundedInt('offset', 0)
  offset?: number = 0;
}

export class PostFilterQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por UUID de curso' })
  @IsOptional()
  @IsUUID(undefined, { message: 'courseId debe ser un UUID válido' })
  courseId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por tipo: study_group o tutoring' })
  @IsOptional()
  @IsString({ message: 'type debe ser texto' })
  type?: string;

  @ApiPropertyOptional({ description: 'Filtrar por ciclo académico (1 a 11, donde 11 corresponde a cursos electivos)' })
  @IsOptional()
  @Type(() => Number)
  @IsBoundedInt('cycle', 1, 11)
  cycle?: number;

  @ApiPropertyOptional({ description: 'Búsqueda parcial en descripción, beneficios y requisitos (insensible a mayúsculas)' })
  @IsOptional()
  @IsString({ message: 'search debe ser texto' })
  search?: string;
}
