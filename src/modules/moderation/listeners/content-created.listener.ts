import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ContentModerationService } from '../services/content-moderation.service';
import { ContentCreatedEvent } from '../events/content-created.event';
import { CONTENT_CREATED_EVENT } from '../moderation.constants';

// Observer de 'content.created'. Se ejecuta en segundo plano (async: true), así que crear un
// post, mensaje o reseña no espera a la moderación. Un fallo queda en el log y no afecta a
// la operación que originó el evento.
@Injectable()
export class ContentCreatedListener {
  private readonly logger = new Logger('ContentCreatedListener');

  constructor(private readonly moderation: ContentModerationService) {}

  @OnEvent(CONTENT_CREATED_EVENT, { async: true })
  async handle(event: ContentCreatedEvent): Promise<void> {
    try {
      await this.moderation.moderate(event);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`No se pudo moderar ${event.contentType} ${event.contentId}: ${reason}`);
    }
  }
}
