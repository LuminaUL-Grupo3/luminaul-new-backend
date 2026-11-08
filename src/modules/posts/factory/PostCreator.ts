import { randomUUID } from 'crypto';
import { PostCreateDto } from '../dto/post-create.dto';
import { PostEntity } from '../entities/post.entity';
import { CourseData } from '../client/CoursesClient';

/**
 * Creator Abstracto (Patrón Factory Method).
 * Define la operación de creación y centraliza la inicialización de atributos base.
 */
export abstract class PostCreator {
  /**
   * Tipo de publicación que este creador sabe construir (e.g. 'study_group', 'tutoring').
   */
  abstract readonly type: string;

  abstract create(
    dto: PostCreateDto,
    userId: string,
    course: CourseData,
  ): Promise<PostEntity>;

  protected buildBaseEntity(
    dto: PostCreateDto,
    userId: string,
    courseId: string,
    groupId: string | null,
    maxCapacity?: number,
  ): PostEntity {
    const post = new PostEntity();
    post.id = randomUUID();
    post.userId = userId;
    post.courseId = courseId;
    post.type = dto.type;
    post.description = dto.description;
    post.benefits = dto.benefits ?? null;
    post.requirements = dto.requirements ?? null;
    post.maxCapacity = maxCapacity ?? dto.maxCapacity ?? 5;
    post.groupId = groupId;
    post.status = 'published';
    post.createdAt = new Date();
    post.updatedAt = new Date();
    return post;
  }
}

