import { Dao } from './Dao';
import { ReviewEntity } from '../entities/review.entity';

// DAO de la tabla reviews: el CRUD heredado más las consultas que pide SPEC-05.
// Las lecturas ignoran las reseñas con borrado lógico (deleted_at).
export abstract class ReviewsDAO extends Dao<string, ReviewEntity> {
  // Reseña vigente que un alumno escribió sobre otro (la usa la regla de reseña única)
  abstract findActiveByPair(
    reviewerId: string,
    reviewedUserId: string,
  ): Promise<ReviewEntity | null>;

  // Reseñas publicadas que recibió un alumno, de la más reciente a la más antigua
  abstract findPublishedByReviewedUser(reviewedUserId: string): Promise<ReviewEntity[]>;

  // Reseñas vigentes (publicadas u ocultas por moderación) que escribió un alumno
  abstract findActiveByReviewer(reviewerId: string): Promise<ReviewEntity[]>;
}
