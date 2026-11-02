import { ApiProperty } from '@nestjs/swagger';
import { ReviewResponseDto } from './ReviewResponseDto';

// UserReviewsSummaryDto del contrato compartido (SPEC-05 §1)
export class UserReviewsSummaryDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-47a8-b9c0-123456789abc' })
  userId!: string;

  @ApiProperty({ example: 4.8, description: 'Promedio redondeado a 1 decimal (0 sin reseñas)' })
  averageRating!: number;

  @ApiProperty({ example: 1 })
  totalReviews!: number;

  @ApiProperty({ type: [ReviewResponseDto] })
  reviews!: ReviewResponseDto[];
}
