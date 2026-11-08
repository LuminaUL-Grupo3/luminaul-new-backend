import { Injectable } from '@nestjs/common';
import { DataSource, Repository, IsNull } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PostEntity } from './entities/post.entity';
import { PostUpdateDto } from './dto/post-update.dto';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

@Injectable()
export class PostsRepository {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
    private readonly dataSource: DataSource,
  ) { }

  /**
   * Consulta directa desacoplada por SQL parametrizado.
   */
  async findGroupById(groupId: string): Promise<{ id: string } | null> {
    const rows = await this.dataSource.query(
      'SELECT id FROM groups WHERE id = $1 AND deleted_at IS NULL',
      [groupId],
    );
    return rows.length > 0 ? { id: rows[0].id } : null;
  }

  /**
   * Persiste una entidad PostEntity construida por el Factory Method.
   */
  async create(post: PostEntity): Promise<PostEntity> {
    const saved = await this.postRepo.save(post);
    return (await this.getPostById(saved.id)) ?? saved;
  }

  async getPosts(
    limit: number,
    offset: number,
    search?: string,
  ): Promise<PaginatedResult<PostEntity>> {
    const qb = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.profile', 'profile')
      .leftJoinAndSelect('post.course', 'course')
      .where('post.deletedAt IS NULL')
      .andWhere('post.status = :status', { status: 'published' });

    if (search && search.trim().length > 0) {
      qb.andWhere(
        '(post.description ILIKE :search OR post.benefits ILIKE :search OR post.requirements ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    const [items, total] = await qb
      .orderBy('post.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { items, total };
  }

  async getPostById(postId: string): Promise<PostEntity | null> {
    return this.postRepo.findOne({
      where: {
        id: postId,
        deletedAt: IsNull(),
      },
      relations: ['profile', 'course'],
    });
  }

  async getPostsByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<PaginatedResult<PostEntity>> {
    const [items, total] = await this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.profile', 'profile')
      .leftJoinAndSelect('post.course', 'course')
      .where('post.userId = :userId', { userId })
      .andWhere('post.deletedAt IS NULL')
      .andWhere('post.status = :status', { status: 'published' })
      .orderBy('post.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { items, total };
  }

  async searchByFilter(
    limit: number,
    offset: number,
    courseId?: string,
    type?: string,
    cycle?: number,
    search?: string,
  ): Promise<PaginatedResult<PostEntity>> {
    const qb = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.profile', 'profile')
      .leftJoinAndSelect('post.course', 'course')
      .where('post.deletedAt IS NULL')
      .andWhere('post.status = :status', { status: 'published' });

    if (courseId) {
      qb.andWhere('post.courseId = :courseId', { courseId });
    }

    if (type) {
      qb.andWhere('post.type = :type', { type });
    }

    if (cycle !== undefined && cycle !== null) {
      qb.andWhere('course.cycle = :cycle', { cycle });
    }

    if (search && search.trim().length > 0) {
      qb.andWhere(
        '(post.description ILIKE :search OR post.benefits ILIKE :search OR post.requirements ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    const [items, total] = await qb
      .orderBy('post.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { items, total };
  }

  async edit(
    postId: string,
    postData: PostUpdateDto,
  ): Promise<PostEntity | null> {
    const post = await this.getPostById(postId);
    if (!post) {
      return null;
    }

    if (postData.courseId !== undefined) {
      post.courseId = postData.courseId;
    }
    if (postData.type !== undefined) {
      post.type = postData.type;
    }
    if (postData.description !== undefined) {
      post.description = postData.description;
    }
    if (postData.benefits !== undefined) {
      post.benefits = postData.benefits;
    }
    if (postData.requirements !== undefined) {
      post.requirements = postData.requirements;
    }
    if (postData.maxCapacity !== undefined) {
      post.maxCapacity = postData.maxCapacity;
    }
    post.updatedAt = new Date();

    return this.postRepo.save(post);
  }

  async delete(postId: string): Promise<boolean> {
    const post = await this.getPostById(postId);
    if (!post) {
      return false;
    }

    post.deletedAt = new Date();
    post.status = 'hidden';
    await this.postRepo.save(post);
    return true;
  }
}
