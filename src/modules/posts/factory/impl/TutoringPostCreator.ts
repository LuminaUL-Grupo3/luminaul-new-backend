import { HttpStatus, Injectable } from '@nestjs/common';
import { PostException } from '../../exception/PostException';
import { PostCreator } from '../PostCreator';
import { PostCreateDto } from '../../dto/post-create.dto';
import { PostEntity } from '../../entities/post.entity';
import { CourseData } from '../../client/CoursesClient';
import { GroupMessagingClient } from '../../client/GroupMessagingClient';
import { POST_MESSAGES, POST_TYPES } from '../../posts.constants';

/**
 * Creador Concreto para publicaciones de tutoría ('tutoring').
 * No permite vincular ni auto-crear grupos manuales; la sala 1-a-1 se crea al aceptar una solicitud.
 */
@Injectable()
export class TutoringPostCreator extends PostCreator {
  readonly type = POST_TYPES.TUTORING;

  constructor(_groupMessagingClient: GroupMessagingClient) {
    super();
  }

  async create(
    dto: PostCreateDto,
    userId: string,
    _course: CourseData,
  ): Promise<PostEntity> {
    if (dto.groupId) {
      throw new PostException(POST_MESSAGES.TUTORING_NO_GROUP, HttpStatus.BAD_REQUEST);
    }

    const targetCourseId = dto.courseId;
    return this.buildBaseEntity(dto, userId, targetCourseId, null);
  }
}

