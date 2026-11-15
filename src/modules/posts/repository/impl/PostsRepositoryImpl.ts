import { Injectable } from '@nestjs/common';
import { DataSource, Repository, IsNull } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PostsRepository, PaginatedResult } from '../PostsRepository';
import { PostEntity } from '../../entities/post.entity';
import { TutoringRequestEntity } from '../../entities/tutoring-request.entity';
import { PostUpdateDto } from '../../dto/post-update.dto';
import {
  MyTutoringRequestDto,
  TutoringRequestIncomingDto,
} from '../../dto/tutoring-request.dto';

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
  groupCurrentMembers: number | null;
  groupMaxCapacity: number | null;
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
  c.cycle AS "courseCycle",
  g.max_capacity AS "groupMaxCapacity",
  CASE
    WHEN g.id IS NOT NULL THEN (
      SELECT COUNT(*)::int
      FROM group_members gm
      WHERE gm.group_id = g.id AND gm.status = 'active'
    )
    ELSE NULL
  END AS "groupCurrentMembers"
`;

const POST_JOIN_FROM = `
  FROM publications p
  LEFT JOIN profiles pr ON pr.user_id = p.user_id
  LEFT JOIN courses c ON c.id = p.course_id
  LEFT JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
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
      groupCurrentMembers:
        row.groupCurrentMembers !== null && row.groupCurrentMembers !== undefined
          ? Number(row.groupCurrentMembers)
          : null,
      groupMaxCapacity:
        row.groupMaxCapacity !== null && row.groupMaxCapacity !== undefined
          ? Number(row.groupMaxCapacity)
          : null,
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

  async createTutoringRequest(
    publicationId: string,
    tutorId: string,
    requesterId: string,
    message: string,
  ): Promise<TutoringRequestEntity> {
    const rows = await this.dataSource.query<TutoringRequestEntity[]>(
      `INSERT INTO tutoring_requests (publication_id, tutor_id, requester_id, message, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING
         id,
         publication_id AS "publicationId",
         tutor_id AS "tutorId",
         requester_id AS "requesterId",
         message,
         status,
         group_id AS "groupId",
         responded_at AS "respondedAt",
         created_at AS "createdAt"`,
      [publicationId, tutorId, requesterId, message],
    );
    return rows[0];
  }

  async findProfileNameByUserId(userId: string): Promise<string | null> {
    const rows = await this.dataSource.query<{ name: string }[]>(
      'SELECT name FROM profiles WHERE user_id = $1 LIMIT 1',
      [userId],
    );
    return rows[0]?.name?.trim() || null;
  }

  async findTutoringRequestById(
    requestId: string,
  ): Promise<TutoringRequestEntity | null> {
    const rows = await this.dataSource.query<TutoringRequestEntity[]>(
      `SELECT
         id,
         publication_id AS "publicationId",
         tutor_id AS "tutorId",
         requester_id AS "requesterId",
         message,
         status,
         group_id AS "groupId",
         responded_at AS "respondedAt",
         created_at AS "createdAt"
       FROM tutoring_requests
       WHERE id = $1
       LIMIT 1`,
      [requestId],
    );
    return rows[0] ?? null;
  }

  async findTutoringRequestByPublicationAndRequester(
    publicationId: string,
    requesterId: string,
  ): Promise<TutoringRequestEntity | null> {
    const rows = await this.dataSource.query<TutoringRequestEntity[]>(
      `SELECT
         tr.id,
         tr.publication_id AS "publicationId",
         tr.tutor_id AS "tutorId",
         tr.requester_id AS "requesterId",
         tr.message,
         tr.status,
         tr.group_id AS "groupId",
         tr.responded_at AS "respondedAt",
         tr.created_at AS "createdAt"
       FROM tutoring_requests tr
       LEFT JOIN groups g ON g.id = tr.group_id AND g.deleted_at IS NULL
       LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = tr.requester_id AND gm.status = 'active'
       WHERE tr.publication_id = $1
         AND tr.requester_id = $2
         AND (
           tr.status = 'pending'
           OR (tr.status = 'accepted' AND g.id IS NOT NULL AND gm.id IS NOT NULL)
         )
       ORDER BY tr.created_at DESC
       LIMIT 1`,
      [publicationId, requesterId],
    );
    return rows[0] ?? null;
  }

  async listIncomingTutoringRequests(
    tutorId: string,
  ): Promise<TutoringRequestIncomingDto[]> {
    interface IncomingRow {
      id: string;
      publicationId: string;
      tutorId: string;
      requesterId: string;
      message: string;
      status: string;
      createdAt: Date | string;
      courseName: string | null;
      publicationDescription: string | null;
      applicantName: string | null;
      applicantEmail: string | null;
      applicantPhoto: string | null;
    }

    const rows = await this.dataSource.query<IncomingRow[]>(
      `SELECT
         tr.id,
         tr.publication_id AS "publicationId",
         tr.tutor_id AS "tutorId",
         tr.requester_id AS "requesterId",
         tr.message,
         tr.status,
         tr.created_at AS "createdAt",
         c.name AS "courseName",
         p.description AS "publicationDescription",
         u.name AS "applicantName",
         u.email AS "applicantEmail",
         pr.profile_photo_url AS "applicantPhoto"
       FROM tutoring_requests tr
       INNER JOIN publications p ON p.id = tr.publication_id
       LEFT JOIN courses c ON c.id = p.course_id
       INNER JOIN users u ON u.id = tr.requester_id
       LEFT JOIN profiles pr ON pr.user_id = tr.requester_id
       WHERE tr.tutor_id = $1
         AND tr.status = 'pending'
         AND p.deleted_at IS NULL
       ORDER BY tr.created_at DESC`,
      [tutorId],
    );

    return rows.map((row) => ({
      id: row.id,
      publicationId: row.publicationId,
      tutorId: row.tutorId,
      requesterId: row.requesterId,
      message: row.message,
      status: row.status,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      courseName: row.courseName ?? 'Curso',
      publicationDescription: row.publicationDescription ?? '',
      applicant: {
        id: row.requesterId,
        name: row.applicantName ?? 'Alumno',
        email: row.applicantEmail ?? '',
        profilePhotoUrl: row.applicantPhoto ?? null,
      },
    }));
  }

  async listMyTutoringRequests(
    requesterId: string,
  ): Promise<MyTutoringRequestDto[]> {
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        publicationId: string;
        status: string;
        groupId: string | null;
        createdAt: Date | string;
      }>
    >(
      `SELECT DISTINCT ON (tr.publication_id)
         tr.id,
         tr.publication_id AS "publicationId",
         CASE
           WHEN tr.status = 'accepted' AND (g.id IS NULL OR gm.id IS NULL) THEN 'rejected'
           ELSE tr.status
         END AS status,
         CASE
           WHEN tr.status = 'accepted' AND (g.id IS NULL OR gm.id IS NULL) THEN NULL
           ELSE tr.group_id
         END AS "groupId",
         tr.created_at AS "createdAt"
       FROM tutoring_requests tr
       LEFT JOIN groups g ON g.id = tr.group_id AND g.deleted_at IS NULL
       LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = tr.requester_id AND gm.status = 'active'
       WHERE tr.requester_id = $1
       ORDER BY tr.publication_id, tr.created_at DESC`,
      [requesterId],
    );

    return rows.map((row) => ({
      id: row.id,
      publicationId: row.publicationId,
      status: row.status,
      groupId: row.groupId ?? null,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    }));
  }

  async decideTutoringRequest(
    requestId: string,
    status: 'accepted' | 'rejected',
    groupId?: string | null,
  ): Promise<TutoringRequestEntity | null> {
    const rows = await this.dataSource.query<TutoringRequestEntity[]>(
      `UPDATE tutoring_requests
       SET status = $2, group_id = COALESCE($3, group_id), responded_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         publication_id AS "publicationId",
         tutor_id AS "tutorId",
         requester_id AS "requesterId",
         message,
         status,
         group_id AS "groupId",
         responded_at AS "respondedAt",
         created_at AS "createdAt"`,
      [requestId, status, groupId ?? null],
    );
    return rows[0] ?? null;
  }
}
