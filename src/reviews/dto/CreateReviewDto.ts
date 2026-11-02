import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsUUID, IsInt, Min, Max, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { REVIEW_LIMITS, REVIEW_MESSAGES } from '../reviews.constants';

// Quita espacios al inicio y al final para que un comentario de solo espacios cuente como vacío
export const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

// Body de POST /reviews (SPEC-05). Aquí solo se valida la forma del dato; las reglas de negocio
// (auto-reseña, grupo compartido, reseña única) están en strategy/.
export class CreateReviewDto {
  @ApiProperty({
    description: 'UUID del estudiante calificado',
    example: 'a1b2c3d4-e5f6-47a8-b9c0-123456789abc',
  })
  @IsUUID(4, { message: REVIEW_MESSAGES.INVALID_USER_ID })
  reviewedUserId!: string;

  @ApiProperty({
    description: 'Estrellas, entero de 1 a 5',
    example: 5,
    minimum: REVIEW_LIMITS.MIN_RATING,
    maximum: REVIEW_LIMITS.MAX_RATING,
  })
  @IsInt({ message: REVIEW_MESSAGES.RATING_NOT_INTEGER })
  @Min(REVIEW_LIMITS.MIN_RATING, { message: REVIEW_MESSAGES.RATING_TOO_LOW })
  @Max(REVIEW_LIMITS.MAX_RATING, { message: REVIEW_MESSAGES.RATING_TOO_HIGH })
  rating!: number;

  @ApiProperty({
    description: 'Opinión sobre el compañero de estudio',
    example: 'Excelente compañero de estudio, muy responsable con los entregables de Cálculo.',
    maxLength: REVIEW_LIMITS.MAX_COMMENT_LENGTH,
  })
  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: REVIEW_MESSAGES.EMPTY_COMMENT })
  @MaxLength(REVIEW_LIMITS.MAX_COMMENT_LENGTH, { message: REVIEW_MESSAGES.COMMENT_TOO_LONG })
  comment!: string;
}
