import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModerationClient } from '../ModerationClient';
import { PostEntity } from '../../entities/post.entity';
import { CONTENT_CREATED_EVENT } from '../../posts.constants';

@Injectable()
export class ModerationClientImpl extends ModerationClient {
  constructor(@Optional() private readonly eventEmitter?: EventEmitter2) {
    super();
  }

  publicationCreated(post: PostEntity): void {
    const text = `${post.description} ${post.benefits ?? ''} ${post.requirements ?? ''}`.trim();
    this.eventEmitter?.emit(CONTENT_CREATED_EVENT, {
      contentType: 'publication',
      contentId: post.id,
      authorId: post.userId,
      text,
    });
  }
}

