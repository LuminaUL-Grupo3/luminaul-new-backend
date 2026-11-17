import { Injectable } from '@nestjs/common';
import { PostCreator } from '../PostCreator';
import { PostCreateDto } from '../../dto/post-create.dto';
import { PostEntity } from '../../entities/post.entity';
import { CourseData } from '../../client/CoursesClient';
import { GroupMessagingClient } from '../../client/GroupMessagingClient';
import { POST_TYPES } from '../../posts.constants';
import { validateLinkedStudyGroup } from '../../validator/PostValidators';

/**
 * Creador Concreto para publicaciones de grupo de estudio ('study_group').
 * Orquesta la vinculación o creación automática del grupo colaborativo.
 */
/** Genera un código corto legible de hasta 20 caracteres a partir del nombre del curso. */
function toCourseCode(courseName: string): string {
  const clean = courseName.trim().replace(/\s+/g, ' ');
  if (clean.length <= 20) return clean.toUpperCase();
  const abbreviated = clean
    .replace(/\bIngenier[íi]a\b/gi, 'Ing.')
    .replace(/\bProgramaci[óo]n\b/gi, 'Prog.')
    .replace(/\bAdministraci[óo]n\b/gi, 'Adm.')
    .replace(/\bArquitectura\b/gi, 'Arq.')
    .replace(/\bEstad[íi]stica\b/gi, 'Est.')
    .replace(/\bMatem[áa]tica\b/gi, 'Mat.')
    .replace(/\bSistemas\b/gi, 'Sist.')
    .replace(/\bDesarrollo\b/gi, 'Des.')
    .replace(/\bGesti[óo]n\b/gi, 'Gest.')
    .replace(/\bInvestigaci[óo]n\b/gi, 'Inv.');
  return abbreviated.slice(0, 20).trim().toUpperCase();
}

@Injectable()
export class StudyGroupPostCreator extends PostCreator {
  readonly type = POST_TYPES.STUDY_GROUP;

  constructor(private readonly groupMessagingClient: GroupMessagingClient) {
    super();
  }

  async create(
    dto: PostCreateDto,
    userId: string,
    course: CourseData,
  ): Promise<PostEntity> {
    const targetGroupId = dto.groupId;
    let finalGroupId: string;
    let resolvedMaxCapacity = dto.maxCapacity;

    if (targetGroupId) {
      const existing = await this.groupMessagingClient.findActiveById(targetGroupId, userId);
      const group = validateLinkedStudyGroup(existing, userId);
      finalGroupId = targetGroupId;
      if (typeof group.maxCapacity === 'number') {
        resolvedMaxCapacity = group.maxCapacity;
      }
    } else {
      // Auto-creación de grupo de estudio para el curso
      finalGroupId = await this.groupMessagingClient.createAutoGroup(
        {
          name: `Grupo de ${course.name}`,
          description: `Grupo de estudio creado para coordinar ${course.name}.`,
          courseCode: toCourseCode(course.name),
          meetingMode: dto.meetingMode,
          meetingShift: dto.meetingShift,
          maxCapacity: dto.maxCapacity,
        },
        userId,
      );
    }

    const targetCourseId = dto.courseId;
    return this.buildBaseEntity(
      dto,
      userId,
      targetCourseId,
      finalGroupId,
      resolvedMaxCapacity,
    );
  }
}

