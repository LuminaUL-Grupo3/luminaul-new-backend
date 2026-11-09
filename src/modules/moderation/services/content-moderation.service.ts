import { Injectable, Logger } from '@nestjs/common';
import { ModerationRepository } from '../repositories/moderation.repository';
import { TargetContentType } from '../enums/moderation.enums';
import { ContentCreatedEvent } from '../events/content-created.event';
import { ModerationTaskWorkerService } from './moderation-task-worker.service';

// HU 6.2: Orquestador de moderación.
// Encola tareas persistentes en PostgreSQL y activa el worker asíncrono.
@Injectable()
export class ContentModerationService {
  private readonly logger = new Logger(ContentModerationService.name);

  constructor(
    private readonly repository: ModerationRepository,
    private readonly worker: ModerationTaskWorkerService,
  ) {}

  // Encola la tarea en moderation_tasks para garantizar persistencia y despierta al worker
  async enqueueAndProcess(event: ContentCreatedEvent): Promise<void> {
    const targetType = event.contentType as TargetContentType;
    await this.repository.enqueueTask(targetType, event.contentId);
    await this.worker.processBatch();
  }
}
