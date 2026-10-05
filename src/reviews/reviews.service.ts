import { ForbiddenException, Injectable } from '@nestjs/common';
import { ReviewsRepository } from './reviews.repository';
import { ReviewEntity } from './entities/review.entity';
import { CreateReviewDto, EditReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly repository: ReviewsRepository) {}
  private response(row: ReviewEntity) {
    return { id: row.id, reviewer_id: row.reviewerId, reviewed_user_id: row.reviewedUserId,
      author_name: row.reviewer?.profile?.name || 'Usuario', target_name: row.reviewedUser?.profile?.name || 'Usuario',
      rating: row.rating, comment: row.comment, status: row.status, created_at: row.createdAt };
  }
  async received(id: string) { return (await this.repository.listReceived(id)).map(row => this.response(row)); }
  async mine(id: string) { return (await this.repository.listMine(id)).map(row => this.response(row)); }
  eligibility(author: string, target: string) { return this.repository.eligibility(author, target); }
  async create(author: string, dto: CreateReviewDto) {
    const eligible = await this.repository.eligibility(author, dto.reviewed_user_id);
    if (!eligible.allowed) throw new ForbiddenException(eligible.reason);
    await this.repository.create(author, dto);
    return { message: 'Reseña publicada.' };
  }
  async update(author: string, id: string, dto: EditReviewDto) { await this.repository.update(author, id, dto); return { message: 'Reseña actualizada.' }; }
  async remove(author: string, id: string) { await this.repository.remove(author, id); return { message: 'Reseña eliminada.' }; }
}
