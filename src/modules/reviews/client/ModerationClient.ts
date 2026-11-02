import { ReviewEntity } from '../entities/review.entity';

// Puerto hacia el motor de moderación (SPEC-06). Reviews solo avisa que hay texto nuevo;
// ocultarlo (status 'hidden') lo decide moderación.
export abstract class ModerationClient {
  abstract reviewWritten(review: ReviewEntity): void;
}
