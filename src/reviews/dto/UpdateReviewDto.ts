import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsInt, Min, Max, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { REVIEW_LIMITS, REVIEW_MESSAGES } from '../reviews.constants';
import { trimText } from './CreateReviewDto';

// Body de PUT /reviews/:reviewId. Ambos campos son opcionales; el que llega reemplaza al actual.
export class UpdateReviewDto {
  @ApiPropertyOptional({
    description: 'Nueva calificación, entero de 1 a 5',
    example: 4,
    minimum: REVIEW_LIMITS.MIN_RATING,
    maximum: REVIEW_LIMITS.MAX_RATING,
  })
  @IsOptional()
  @IsInt({ message: REVIEW_MESSAGES.RATING_NOT_INTEGER })
  @Min(REVIEW_LIMITS.MIN_RATING, { message: REVIEW_MESSAGES.RATING_TOO_LOW })
  @Max(REVIEW_LIMITS.MAX_RATING, { message: REVIEW_MESSAGES.RATING_TOO_HIGH })
  rating?: number;

  @ApiPropertyOptional({
    description: 'Nuevo comentario',
    example: 'Sigue siendo un gran compañero; ahora también explica muy bien Física.',
    maxLength: REVIEW_LIMITS.MAX_COMMENT_LENGTH,
  })
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: REVIEW_MESSAGES.EMPTY_COMMENT })
  @MaxLength(REVIEW_LIMITS.MAX_COMMENT_LENGTH, { message: REVIEW_MESSAGES.COMMENT_TOO_LONG })
  comment?: string;
}
