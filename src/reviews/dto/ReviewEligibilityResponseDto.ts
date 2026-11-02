import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ReviewEligibilityResponse del contrato compartido (SPEC-05 §1)
export class ReviewEligibilityResponseDto {
  @ApiProperty({ example: false })
  allowed!: boolean;

  @ApiPropertyOptional({ example: 'Ya has calificado a este estudiante anteriormente' })
  reason?: string;
}
