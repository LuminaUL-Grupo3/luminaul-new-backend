import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModerationClient } from '../ModerationClient';
import { ReviewEntity } from '../../entities/review.entity';
import { CONTENT_CREATED_EVENT } from '../../reviews.constants';

// Adapter: traduce reviewWritten() a un evento de EventEmitter2 (Adaptee).
// Emite 'content.created' con la misma forma que PostsService. SPEC-06 lo escucha con
// @OnEvent(..., { async: true }), así que moderar no retrasa la respuesta HTTP.
// Mientras EventEmitterModule no esté registrado, el emisor no existe y no se hace nada.
@Injectable()
export class ModerationClientImpl extends ModerationClient {
  constructor(@Optional() private readonly eventEmitter?: EventEmitter2) {
    super();
  }

  reviewWritten(review: ReviewEntity): void {
    this.eventEmitter?.emit(CONTENT_CREATED_EVENT, {
      contentType: 'review',
      contentId: review.id,
      authorId: review.reviewerId,
      text: review.comment,
    });
  }
}
