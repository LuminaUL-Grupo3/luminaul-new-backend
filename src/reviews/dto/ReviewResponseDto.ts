import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewEntity } from '../entities/review.entity';
import { REVIEW_STATUS, ReviewStatus } from '../reviews.constants';

// ReviewAuthorDto del contrato compartido (SPEC-05 §1)
export class ReviewAuthorDto {
  @ApiProperty({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  id!: string;

  @ApiProperty({ example: 'Martín Vizcarra' })
  name!: string;

  @ApiPropertyOptional({ example: 'https://avatar.test/martin.png', nullable: true })
  profilePhotoUrl!: string | null;
}

// ReviewDto del contrato compartido (SPEC-05 §1)
export class ReviewResponseDto {
  @ApiProperty({ example: '99887766-5544-3322-1100-aabbccddeeff' })
  id!: string;

  @ApiProperty({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  reviewerId!: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-47a8-b9c0-123456789abc' })
  reviewedUserId!: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  rating!: number;

  @ApiProperty({ example: 'Excelente compañero de estudio, muy responsable con los entregables.' })
  comment!: string;

  @ApiProperty({ enum: Object.values(REVIEW_STATUS), example: REVIEW_STATUS.PUBLISHED })
  status!: ReviewStatus;

  @ApiProperty({ example: '2026-10-29T14:35:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-10-29T14:35:00.000Z' })
  updatedAt!: string;

  @ApiProperty({ type: ReviewAuthorDto })
  reviewer!: ReviewAuthorDto;

  // Extensión del contrato: a quién se calificó. "Reseñas que escribí" necesita su nombre.
  @ApiProperty({ type: ReviewAuthorDto })
  reviewedUser!: ReviewAuthorDto;

  // Entidad -> contrato JSON. `people` trae nombre y foto de autor y reseñado (ProfileClient).
  static fromEntity(
    review: ReviewEntity,
    people: Map<string, ReviewAuthorDto>,
  ): ReviewResponseDto {
    return {
      id: review.id,
      reviewerId: review.reviewerId,
      reviewedUserId: review.reviewedUserId,
      rating: review.rating,
      comment: review.comment,
      status: review.status as ReviewStatus,
      createdAt: new Date(review.createdAt).toISOString(),
      updatedAt: new Date(review.updatedAt).toISOString(),
      reviewer: people.get(review.reviewerId) ?? unknownPerson(review.reviewerId),
      reviewedUser: people.get(review.reviewedUserId) ?? unknownPerson(review.reviewedUserId),
    };
  }
}

// Alumno cuya cuenta ya no existe: se muestra sin nombre ni foto
function unknownPerson(id: string): ReviewAuthorDto {
  return { id, name: '', profilePhotoUrl: null };
}
