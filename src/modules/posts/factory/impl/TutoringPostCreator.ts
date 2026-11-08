import { Injectable, NotFoundException } from '@nestjs/common';
import { PostCreator } from '../PostCreator';
import { PostCreateDto } from '../../dto/post-create.dto';
import { PostEntity } from '../../entities/post.entity';
import { CourseData } from '../../client/CoursesClient';
import { GroupMessagingClient } from '../../client/GroupMessagingClient';
import { POST_MESSAGES, POST_TYPES } from '../../posts.constants';

/**
 * Creador Concreto para publicaciones de tutoría ('tutoring').
 * No auto-crea grupos de estudio; opcionalmente vincula a uno si fue especificado.
 */
@Injectable()
export class TutoringPostCreator extends PostCreator {
  readonly type = POST_TYPES.TUTORING;

  constructor(private readonly groupMessagingClient: GroupMessagingClient) {
    super();
  }

  async create(
    dto: PostCreateDto,
    userId: string,
    _course: CourseData,
  ): Promise<PostEntity> {
    const targetGroupId = PostCreateDto.getGroupId(dto);
    let finalGroupId: string | null = null;

    if (targetGroupId) {
      const existing = await this.groupMessagingClient.findActiveById(targetGroupId);
      if (!existing) {
        throw new NotFoundException(POST_MESSAGES.GROUP_NOT_FOUND);
      }
      finalGroupId = targetGroupId;
    }

    const targetCourseId = PostCreateDto.getCourseId(dto);
    return this.buildBaseEntity(dto, userId, targetCourseId, finalGroupId);
  }
}

