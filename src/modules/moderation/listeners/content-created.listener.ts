import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ContentModerationService } from '../service/content-moderation.service';
import { ContentCreatedEvent } from '../events/content-created.event';
import { CONTENT_CREATED_EVENT } from '../moderation.constants';
import { ModerationTaskWorkerService } from '../service/moderation-task-worker.service';

// Observer de 'content.created' y 'moderation.wakeup'.
// Se ejecuta en segundo plano (async: true) para no bloquear al usuario.
@Injectable()
export class ContentCreatedListener {
  private readonly logger = new Logger(ContentCreatedListener.name);

  constructor(
    private readonly moderation: ContentModerationService,
    private readonly worker: ModerationTaskWorkerService,
  ) {}

  @OnEvent(CONTENT_CREATED_EVENT, { async: true })
  async handleContentCreated(event: ContentCreatedEvent): Promise<void> {
    try {
      await this.moderation.enqueueAndProcess(event);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`No se pudo procesar evento content.created para ${event.contentType} ${event.contentId}: ${reason}`);
    }
  }

  @OnEvent('moderation.wakeup', { async: true })
  async handleWakeup(): Promise<void> {
    try {
      await this.worker.processBatch();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al procesar lote de moderación tras wakeup: ${reason}`);
    }
  }
}
