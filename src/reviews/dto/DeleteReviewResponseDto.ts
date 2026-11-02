import { ApiProperty } from '@nestjs/swagger';

// Respuesta de DELETE /reviews/:reviewId (SPEC-05)
export class DeleteReviewResponseDto {
  @ApiProperty({ example: 'Reseña eliminada con éxito' })
  message!: string;

  @ApiProperty({ example: '99887766-5544-3322-1100-aabbccddeeff' })
  deletedId!: string;
}
