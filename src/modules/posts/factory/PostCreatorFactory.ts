import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PostCreator } from './PostCreator';
import { StudyGroupPostCreator } from './impl/StudyGroupPostCreator';
import { TutoringPostCreator } from './impl/TutoringPostCreator';
import { POST_MESSAGES, POST_TYPES } from '../posts.constants';

/**
 * Factory Dispatcher que resuelve el creador correspondiente según el tipo de publicación.
 */
@Injectable()
export class PostCreatorFactory {
  constructor(
    private readonly studyGroupCreator: StudyGroupPostCreator,
    private readonly tutoringCreator: TutoringPostCreator,
  ) {}

  getCreator(type: string): PostCreator {
    switch (type) {
      case POST_TYPES.STUDY_GROUP:
        return this.studyGroupCreator;
      case POST_TYPES.TUTORING:
        return this.tutoringCreator;
      default:
        throw new UnprocessableEntityException(POST_MESSAGES.UNSUPPORTED_TYPE);
    }
  }
}

