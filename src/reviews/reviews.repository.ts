import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { ReviewEntity } from './entities/review.entity';
import { UserEntity } from '../users/entities/user.entity';
import { CreateReviewDto, EditReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsRepository {
  constructor(private readonly db: DataSource) {}
  listReceived(id: string) {
    return this.db.getRepository(ReviewEntity).find({ where: { reviewedUserId: id, status: 'published', deletedAt: IsNull() }, relations: ['reviewer.profile', 'reviewedUser.profile'], order: { createdAt: 'DESC' } });
  }
  listMine(id: string) {
    return this.db.getRepository(ReviewEntity).find({ where: { reviewerId: id, deletedAt: IsNull() }, relations: ['reviewer.profile', 'reviewedUser.profile'], order: { createdAt: 'DESC' } });
  }
  async eligibility(author: string, target: string) {
    if (author === target) return { allowed: false, reason: 'No puedes escribir una reseña de tu propio perfil.' };
    const user = await this.db.getRepository(UserEntity).findOneBy({ id: target, deletedAt: IsNull(), status: 'active', isVerified: true });
    if (!user) throw new NotFoundException('No encontramos este perfil.');
    const existing = await this.db.getRepository(ReviewEntity).exist({ where: { reviewerId: author, reviewedUserId: target, deletedAt: IsNull() } });
    if (existing) return { allowed: false, reason: 'Ya escribiste una reseña de este usuario. Puedes editarla en Mis reseñas.' };
    const shared = await this.db.query(`SELECT 1 FROM group_members a JOIN group_members b ON a.group_id = b.group_id
      JOIN groups g ON g.id = a.group_id WHERE a.user_id=$1 AND b.user_id=$2 AND g.deleted_at IS NULL LIMIT 1`, [author, target]);
    return shared.length ? { allowed: true, reason: '' } : { allowed: false, reason: 'Necesitas compartir un grupo con este usuario para escribir una reseña.' };
  }
  async create(author: string, dto: CreateReviewDto) {
    try {
      await this.db.transaction(async manager => {
        // Serializa las reseñas del autor; conserva la restricción de una reseña por par de usuarios.
        await manager.findOneOrFail(UserEntity, { where: { id: author }, lock: { mode: 'pessimistic_write' } });
        const row = await manager.findOneBy(ReviewEntity, { reviewerId: author, reviewedUserId: dto.reviewed_user_id });
        if (row && !row.deletedAt) throw new ConflictException('Ya escribiste una reseña de este usuario.');
        await manager.save(ReviewEntity, manager.create(ReviewEntity, {
          ...(row || {}), reviewerId: author, reviewedUserId: dto.reviewed_user_id, rating: dto.rating, comment: dto.comment, status: 'published', deletedAt: null,
        }));
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Ya escribiste una reseña de este usuario.');
      throw error;
    }
  }
  async update(author: string, id: string, dto: EditReviewDto) {
    const result = await this.db.getRepository(ReviewEntity).update({ id, reviewerId: author, deletedAt: IsNull(), status: 'published' }, { rating: dto.rating, comment: dto.comment });
    if (!result.affected) throw new NotFoundException('No encontramos una reseña editable de tu autoría.');
  }
  async remove(author: string, id: string) {
    const result = await this.db.getRepository(ReviewEntity).update({ id, reviewerId: author, deletedAt: IsNull() }, { deletedAt: new Date(), status: 'deleted' });
    if (!result.affected) throw new NotFoundException('No encontramos esa reseña entre las que escribiste.');
  }
}
