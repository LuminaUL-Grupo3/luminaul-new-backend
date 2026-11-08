import { Injectable, NotFoundException } from '@nestjs/common';
import { PostCreator } from '../PostCreator';
import { PostCreateDto } from '../../dto/post-create.dto';
import { PostEntity } from '../../entities/post.entity';
import { CourseData } from '../../client/CoursesClient';
import { GroupMessagingClient } from '../../client/GroupMessagingClient';
import { POST_MESSAGES } from '../../posts.constants';

/**
 * Creador Concreto para publicaciones de grupo de estudio ('study_group').
 * Orquesta la vinculación o creación automática del grupo colaborativo.
 */
@Injectable()
export class StudyGroupPostCreator extends PostCreator {
  constructor(private readonly groupMessagingClient: GroupMessagingClient) {
    super();
  }

  async create(
    dto: PostCreateDto,
    userId: string,
    course: CourseData,
  ): Promise<PostEntity> {
    const targetGroupId = PostCreateDto.getGroupId(dto);
    let finalGroupId: string;

    if (targetGroupId) {
      const existing = await this.groupMessagingClient.findActiveById(targetGroupId);
      if (!existing) {
        throw new NotFoundException(POST_MESSAGES.GROUP_NOT_FOUND);
      }
      finalGroupId = targetGroupId;
    } else {
      // Auto-creación de grupo de estudio para el curso
      finalGroupId = await this.groupMessagingClient.createAutoGroup(
        {
          name: `Grupo de ${course.name}`,
          description: `Grupo de estudio creado automáticamente para coordinar ${course.name}.`,
          benefits: dto.benefits ?? null,
          requirements: dto.requirements ?? null,
        },
        userId,
      );
    }

    const targetCourseId = PostCreateDto.getCourseId(dto);
    return this.buildBaseEntity(dto, userId, targetCourseId, finalGroupId);
  }
}

