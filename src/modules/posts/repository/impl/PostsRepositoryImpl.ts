import { Injectable } from '@nestjs/common';
import { DataSource, Repository, IsNull } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PostsRepository, PaginatedResult } from '../PostsRepository';
import { PostEntity } from '../../entities/post.entity';
import { PostUpdateDto } from '../../dto/post-update.dto';

interface PostJoinRow {
  id: string;
  userId: string;
  groupId: string | null;
  courseId: string;
  type: string;
  description: string;
  color: string | null;
  benefits: string | null;
  requirements: string | null;
  maxCapacity: number;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt: Date | string | null;
  authorName: string | null;
  profilePhotoUrl: string | null;
  courseName: string | null;
  courseCycle: number | null;
}

const POST_SELECT_COLUMNS = `
  p.id AS id,
  p.user_id AS "userId",
  p.group_id AS "groupId",
  p.course_id AS "courseId",
  p.type AS type,
  p.description AS description,
  p.color AS color,
  p.benefits AS benefits,
  p.requirements AS requirements,
  p.max_capacity AS "maxCapacity",
  p.status AS status,
  p.created_at AS "createdAt",
  p.updated_at AS "updatedAt",
  p.deleted_at AS "deletedAt",
  pr.name AS "authorName",
  pr.profile_photo_url AS "profilePhotoUrl",
  c.name AS "courseName",
  c.cycle AS "courseCycle"
`;

const POST_JOIN_FROM = `
  FROM publications p
  LEFT JOIN profiles pr ON pr.user_id = p.user_id
  LEFT JOIN courses c ON c.id = p.course_id
`;

// Implementación del repositorio de publicaciones con TypeORM y SQL desacoplado sobre PostgreSQL.
@Injectable()
export class PostsRepositoryImpl extends PostsRepository {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  private mapRowToEntity(row: PostJoinRow): PostEntity {
    return Object.assign(new PostEntity(), {
      id: row.id,
      userId: row.userId,
      groupId: row.groupId,
      courseId: row.courseId,
      type: row.type,
      description: row.description,
      color: row.color ?? 'white',
      benefits: row.benefits,
      requirements: row.requirements,
      maxCapacity: row.maxCapacity,
      status: row.status,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      deletedAt: row.deletedAt ? new Date(row.deletedAt) : null,
      profile: {
        id: row.userId,
        userId: row.userId,
        name: row.authorName ?? '',
        profilePhotoUrl: row.profilePhotoUrl ?? null,
      },
      course: {
        id: row.courseId,
        name: row.courseName ?? '',
        cycle: row.courseCycle ?? null,
      },
    });
  }

  private async queryPaginatedPosts(
    conditions: string[],
    params: unknown[],
    limit: number,
    offset: number,
  ): Promise<PaginatedResult<PostEntity>> {
    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;

    const [rows, countRows] = await Promise.all([
      this.dataSource.query<PostJoinRow[]>(
        `SELECT ${POST_SELECT_COLUMNS}
         ${POST_JOIN_FROM}
         ${whereClause}
         ORDER BY p.created_at DESC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        [...params, limit, offset],
      ),
      this.dataSource.query<{ total: number }[]>(
        `SELECT COUNT(*)::int AS total
         ${POST_JOIN_FROM}
         ${whereClause}`,
        params,
      ),
    ]);

    return {
      items: rows.map((row) => this.mapRowToEntity(row)),
      total: countRows[0]?.total ?? 0,
    };
  }

  // --- Implementación de CrudRepository ---

  findById(id: string): Promise<PostEntity | null> {
    return this.getPostById(id);
  }

  findAll(): Promise<PostEntity[]> {
    return this.postRepo.find({
      where: { deletedAt: IsNull(), status: 'published' },
      order: { createdAt: 'DESC' },
    });
  }

  async insert(entity: Partial<PostEntity>): Promise<PostEntity> {
    const post = this.postRepo.create(entity);
    return this.create(post);
  }

  async update(entity: PostEntity): Promise<PostEntity> {
    entity.updatedAt = new Date();
    return this.postRepo.save(entity);
  }

  // --- Métodos específicos del dominio de Posts ---

  /**
   * Consulta directa desacoplada por SQL parametrizado.
   */
  async findGroupById(groupId: string): Promise<{ id: string } | null> {
    const rows = await this.dataSource.query<{ id: string }[]>(
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
    const conditions = ['p.deleted_at IS NULL', 'p.status = $1'];
    const params: unknown[] = ['published'];

    if (search && search.trim().length > 0) {
      params.push(`%${search.trim()}%`);
      const idx = params.length;
      conditions.push(
        `(p.description ILIKE $${idx} OR p.benefits ILIKE $${idx} OR p.requirements ILIKE $${idx})`,
      );
    }

    return this.queryPaginatedPosts(conditions, params, limit, offset);
  }

  async getPostById(postId: string): Promise<PostEntity | null> {
    const rows = await this.dataSource.query<PostJoinRow[]>(
      `SELECT ${POST_SELECT_COLUMNS}
       ${POST_JOIN_FROM}
       WHERE p.id = $1 AND p.deleted_at IS NULL
       LIMIT 1`,
      [postId],
    );
    return rows.length > 0 ? this.mapRowToEntity(rows[0]) : null;
  }

  async getPostsByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<PaginatedResult<PostEntity>> {
    return this.queryPaginatedPosts(
      ['p.user_id = $1', 'p.deleted_at IS NULL', 'p.status = $2'],
      [userId, 'published'],
      limit,
      offset,
    );
  }

  async searchByFilter(
    limit: number,
    offset: number,
    courseId?: string,
    type?: string,
    cycle?: number,
    search?: string,
  ): Promise<PaginatedResult<PostEntity>> {
    const conditions = ['p.deleted_at IS NULL', 'p.status = $1'];
    const params: unknown[] = ['published'];

    if (courseId) {
      params.push(courseId);
      conditions.push(`p.course_id = $${params.length}`);
    }

    if (type) {
      params.push(type);
      conditions.push(`p.type = $${params.length}`);
    }

    if (cycle !== undefined && cycle !== null) {
      params.push(cycle);
      conditions.push(`c.cycle = $${params.length}`);
    }

    if (search && search.trim().length > 0) {
      params.push(`%${search.trim()}%`);
      const idx = params.length;
      conditions.push(
        `(p.description ILIKE $${idx} OR p.benefits ILIKE $${idx} OR p.requirements ILIKE $${idx})`,
      );
    }

    return this.queryPaginatedPosts(conditions, params, limit, offset);
  }

  async edit(
    postId: string,
    postData: PostUpdateDto,
  ): Promise<PostEntity | null> {
    const post = await this.postRepo.findOne({
      where: { id: postId, deletedAt: IsNull() },
    });
    if (!post) {
      return null;
    }

    if (postData.color !== undefined) post.color = postData.color;
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
    if (postData.groupId !== undefined) {
      post.groupId = postData.groupId;
    }
    post.updatedAt = new Date();

    const saved = await this.postRepo.save(post);
    return (await this.getPostById(saved.id)) ?? saved;
  }

  async delete(postId: string): Promise<boolean> {
    const post = await this.postRepo.findOne({
      where: { id: postId, deletedAt: IsNull() },
    });
    if (!post) {
      return false;
    }

    post.deletedAt = new Date();
    post.status = 'hidden';
    await this.postRepo.save(post);
    return true;
  }
}
