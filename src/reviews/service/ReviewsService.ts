import { CreateReviewDto } from '../dto/CreateReviewDto';
import { UpdateReviewDto } from '../dto/UpdateReviewDto';
import { ReviewResponseDto } from '../dto/ReviewResponseDto';
import { UserReviewsSummaryDto } from '../dto/UserReviewsSummaryDto';
import { ReviewEligibilityResponseDto } from '../dto/ReviewEligibilityResponseDto';
import { DeleteReviewResponseDto } from '../dto/DeleteReviewResponseDto';

// Casos de uso de SPEC-05 (como PagoService en la Semana 08). El controller depende de esta
// abstracción y ReviewsModule elige la implementación (D de SOLID).
export abstract class ReviewsService {
  // HU 5.1: publicar una reseña
  abstract create(reviewerId: string, payload: CreateReviewDto): Promise<ReviewResponseDto>;

  // HU 5.2: promedio y reseñas publicadas de un alumno (también "Reseñas recibidas")
  abstract getUserSummary(userId: string): Promise<UserReviewsSummaryDto>;

  // Reseñas que escribió el alumno autenticado (GET /reviews/me)
  abstract listMine(reviewerId: string): Promise<ReviewResponseDto[]>;

  // HU 5.1: ¿se muestra "Publicar reseña"? Mismas reglas que create
  abstract checkEligibility(
    reviewerId: string,
    reviewedUserId: string,
  ): Promise<ReviewEligibilityResponseDto>;

  // HU 5.3: editar una reseña propia
  abstract update(
    reviewId: string,
    payload: UpdateReviewDto,
    actorId: string,
  ): Promise<ReviewResponseDto>;

  // HU 5.4: eliminar una reseña propia
  abstract remove(reviewId: string, actorId: string): Promise<DeleteReviewResponseDto>;
}
