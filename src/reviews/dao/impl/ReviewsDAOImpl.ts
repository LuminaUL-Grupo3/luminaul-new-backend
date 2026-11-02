import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { ReviewsDAO } from '../ReviewsDAO';
import { ReviewEntity } from '../../entities/review.entity';
import { ReviewException } from '../../exception/ReviewException';
import { REVIEW_MESSAGES, REVIEW_STATUS } from '../../reviews.constants';

// Código de PostgreSQL para "unique_violation"
const PG_UNIQUE_VIOLATION = '23505';

// Implementación del DAO con TypeORM sobre PostgreSQL. Solo lee la tabla reviews: los datos
// de autor y reseñado los trae ProfileClient (sin relaciones con entidades de otros módulos).
@Injectable()
export class ReviewsDAOImpl extends ReviewsDAO {
  constructor(
    @InjectRepository(ReviewEntity)
    private readonly reviewRepo: Repository<ReviewEntity>,
  ) {
    super();
  }

  findById(id: string): Promise<ReviewEntity | null> {
    return this.reviewRepo.findOne({ where: { id, deletedAt: IsNull() } });
  }

  findAll(): Promise<ReviewEntity[]> {
    return this.reviewRepo.find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async insert(review: Partial<ReviewEntity>): Promise<ReviewEntity> {
    try {
      const saved = await this.reviewRepo.save(this.reviewRepo.create(review));
      return (await this.findById(saved.id)) as ReviewEntity;
    } catch (error) {
      // El índice único parcial uq_active_review también frena dos POST simultáneos del mismo par
      if (isUniqueViolation(error)) {
        throw new ReviewException(REVIEW_MESSAGES.ALREADY_REVIEWED, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  // Actualiza solo los campos editables; updated_at lo pone TypeORM (@UpdateDateColumn)
  async update(review: ReviewEntity): Promise<ReviewEntity> {
    await this.reviewRepo.update(
      { id: review.id },
      { rating: review.rating, comment: review.comment, status: review.status },
    );
    return (await this.findById(review.id)) as ReviewEntity;
  }

  // Borrado lógico (SPEC-05: soft delete): marca deleted_at y status 'deleted', no borra la fila
  async delete(id: string): Promise<boolean> {
    const result = await this.reviewRepo.update(
      { id, deletedAt: IsNull() },
      { deletedAt: new Date(), status: REVIEW_STATUS.DELETED },
    );
    return (result.affected ?? 0) > 0;
  }

  findActiveByPair(reviewerId: string, reviewedUserId: string): Promise<ReviewEntity | null> {
    return this.reviewRepo.findOne({
      where: { reviewerId, reviewedUserId, deletedAt: IsNull() },
    });
  }

  findPublishedByReviewedUser(reviewedUserId: string): Promise<ReviewEntity[]> {
    return this.reviewRepo.find({
      where: { reviewedUserId, status: REVIEW_STATUS.PUBLISHED, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  findActiveByReviewer(reviewerId: string): Promise<ReviewEntity[]> {
    return this.reviewRepo.find({
      where: { reviewerId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === PG_UNIQUE_VIOLATION
  );
}
