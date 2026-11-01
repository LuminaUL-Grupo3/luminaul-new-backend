import { IsOptional, IsUUID, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Cantidad de elementos a retornar', default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 15;

  @ApiPropertyOptional({ description: 'Desplazamiento para paginación', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class PostFilterQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por UUID de curso (snake_case)' })
  @IsOptional()
  @IsUUID(undefined, { message: 'course_id must be a valid UUID' })
  course_id?: string;

  @ApiPropertyOptional({ description: 'Filtrar por UUID de curso (camelCase)' })
  @IsOptional()
  @IsUUID(undefined, { message: 'courseId must be a valid UUID' })
  courseId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por tipo: study_group o tutoring' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Filtrar por ciclo académico (1 a 10)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  cycle?: number;

  @ApiPropertyOptional({ description: 'Búsqueda parcial en descripción, beneficios y requisitos (insensible a mayúsculas)' })
  @IsOptional()
  @IsString()
  search?: string;

  static getCourseId(dto: PostFilterQueryDto): string | undefined {
    return dto.courseId || dto.course_id;
  }
}
