import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModerationRepository } from '../repositories/moderation.repository';
import { resolveModeratedContent } from '../policies/moderated-content';
import { findBannedWords } from './lexical-filter';
import { TargetContentType } from '../enums/moderation.enums';
import {
  ChatMessageHiddenEvent,
  ContentCreatedEvent,
  ModerationNotificationEvent,
} from '../events/content-created.event';
import {
  CHAT_MESSAGE_HIDDEN_EVENT,
  MODERATION_MESSAGES,
  NOTIFICATION_SEND_EVENT,
} from '../moderation.constants';
import { ModerationTaskWorkerService } from './moderation-task-worker.service';

export type ModerationOutcome =
  | { status: 'clean' }
  | { status: 'skipped'; reason: string }
  | { status: 'hidden'; moderationLogId: string; detectedWords: string[] };

// HU 6.2: Orquestador de moderación.
// Encola tareas persistentes en PostgreSQL y ejecuta el procesamiento desacoplado.
@Injectable()
export class ContentModerationService {
  private readonly logger = new Logger(ContentModerationService.name);

  constructor(
    private readonly repository: ModerationRepository,
    private readonly events: EventEmitter2,
    @Optional() private readonly worker?: ModerationTaskWorkerService,
  ) {}

  // Encola la tarea en moderation_tasks para garantizar persistencia y despierta al worker
  async enqueueAndProcess(event: ContentCreatedEvent): Promise<void> {
    const targetType = event.contentType as TargetContentType;
    await this.repository.enqueueTask(targetType, event.contentId, 1);

    if (this.worker) {
      await this.worker.processBatch();
    } else {
      await this.moderate(event);
    }
  }

  // Ejecución directa de moderación síncrona/inmediata
  async moderate(event: ContentCreatedEvent): Promise<ModerationOutcome> {
    const source = resolveModeratedContent(event.contentType);
    if (!source) {
      return { status: 'skipped', reason: `tipo de contenido desconocido: ${event.contentType}` };
    }

    const detectedWords = findBannedWords(event.text ?? '', await this.repository.listBannedWords());
    if (detectedWords.length === 0) return { status: 'clean' };

    // El autor y el grupo se leen de la base, no del evento, para no confiar en el emisor
    const content = await this.repository.findContent(source, event.contentId);
    if (!content) return { status: 'skipped', reason: 'el contenido ya no existe' };

    const log = await this.repository.hideAndSaveLog(
      source,
      event.contentType,
      event.contentId,
      content.authorId,
      detectedWords,
    );
    if (!log) {
      return { status: 'skipped', reason: `el contenido no estaba publicado (${content.status})` };
    }

    if (event.contentType === TargetContentType.MESSAGE && content.groupId) {
      const hiddenMessage: ChatMessageHiddenEvent = {
        groupId: content.groupId,
        messageId: event.contentId,
      };
      this.events.emit(CHAT_MESSAGE_HIDDEN_EVENT, hiddenMessage);
    }

    const notification: ModerationNotificationEvent = {
      userId: content.authorId,
      title: MODERATION_MESSAGES.NOTIFICATION_TITLE,
      message:
        `Tu ${source.label} fue ocultada automáticamente por contener términos no permitidos ` +
        `(${detectedWords.join(', ')}). Si crees que es un error, puedes apelar desde tu historial de moderación.`,
      type: 'MODERATION',
    };
    this.events.emit(NOTIFICATION_SEND_EVENT, notification);

    this.logger.log(
      `${event.contentType} ${event.contentId} ocultado por: ${detectedWords.join(', ')}`,
    );
    return { status: 'hidden', moderationLogId: log.id, detectedWords };
  }
}
