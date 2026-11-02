import { Injectable, Logger } from '@nestjs/common';
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

export type ModerationOutcome =
  | { status: 'clean' }
  | { status: 'skipped'; reason: string }
  | { status: 'hidden'; moderationLogId: string; detectedWords: string[] };

// HU 6.2: revisa el texto recibido, oculta el contenido infractor, deja el registro en
// moderation_logs y avisa al chat (SPEC-04) y al autor (SPEC-07) mediante eventos.
@Injectable()
export class ContentModerationService {
  private readonly logger = new Logger('ContentModeration');

  constructor(
    private readonly repository: ModerationRepository,
    private readonly events: EventEmitter2,
  ) {}

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

    const hidden = await this.repository.hideContent(source, event.contentId);
    if (!hidden) {
      return { status: 'skipped', reason: `el contenido no estaba publicado (${content.status})` };
    }

    const log = await this.repository.saveLog(
      event.contentType,
      event.contentId,
      content.authorId,
      detectedWords,
    );

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
