import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { ModerationRepository } from '../repositories/moderation.repository';
import { ProfanityFilterService } from './profanity-filter.service';
import { OpenAiModerationService } from './openai-moderation.service';
import { resolveModeratedContent } from '../policies/moderated-content';
import {
  LexicalResult,
  ModerationDecision,
  SemanticStatus,
  TargetContentType,
} from '../enums/moderation.enums';
import {
  CHAT_MESSAGE_HIDDEN_EVENT,
  MODERATION_MESSAGES,
  NOTIFICATION_SEND_EVENT,
} from '../moderation.constants';
import {
  ChatMessageHiddenEvent,
  ModerationNotificationEvent,
} from '../events/content-created.event';

@Injectable()
export class ModerationTaskWorkerService {
  private readonly logger = new Logger(ModerationTaskWorkerService.name);
  private readonly workerId = `worker-${process.pid}-${Math.random().toString(36).substring(2, 8)}`;
  private isRunning = false;

  constructor(
    private readonly repository: ModerationRepository,
    private readonly profanityFilter: ProfanityFilterService,
    private readonly openAiModeration: OpenAiModerationService,
    private readonly events: EventEmitter2,
  ) {}

  async processBatch(batchSize = 10): Promise<number> {
    if (this.isRunning) return 0;
    this.isRunning = true;

    try {
      // Etapa A: Reclamación con SELECT ... FOR UPDATE SKIP LOCKED en transacción corta
      const tasks = await this.repository.claimNextBatch(batchSize, this.workerId, 30);
      if (tasks.length === 0) return 0;

      this.logger.debug(`Worker ${this.workerId} reclamó ${tasks.length} tareas de moderación.`);

      for (const task of tasks) {
        await this.processSingleTask(task);
      }

      return tasks.length;
    } catch (error) {
      this.logger.error('Error durante la ejecución del batch de moderación', error);
      return 0;
    } finally {
      this.isRunning = false;
    }
  }

  private async processSingleTask(task: {
    id: string;
    contentType: TargetContentType;
    contentId: string;
    contentVersion: number;
    attempts: number;
    maxAttempts: number;
    lockToken?: string | null;
  }): Promise<void> {
    const lockToken = task.lockToken;
    if (!lockToken) return;

    const source = resolveModeratedContent(task.contentType);
    if (!source) {
      this.logger.warn(`Tipo de contenido desconocido: ${task.contentType}`);
      return;
    }

    // Etapa B: Ejecución fuera de transacción (cero conexiones a DB durante llamada externa)
    const content = await this.repository.findContent(source, task.contentId);
    if (!content) {
      this.logger.debug(`El contenido ${task.contentId} ya no existe o fue eliminado.`);
      await this.repository.completeTaskDiscarded(
        task.id,
        lockToken,
        'CONTENT_DELETED_OR_NOT_FOUND',
      );
      return;
    }

    this.logger.debug(`Moderando contenido: "${content.text}" de tipo ${task.contentType}`);

    // 1. Capa 1: Filtro Léxico Inmediato
    const lexicalCheck = await this.profanityFilter.checkMessage(content.text ?? '');
    this.logger.debug(`Resultado léxico: clean=${lexicalCheck.clean}, detected=${lexicalCheck.detectedWords}`);
    if (!lexicalCheck.clean) {
      // Bloqueado inmediatamente por léxico local
      const log = await this.repository.completeTaskSuccess(
        task.id,
        lockToken,
        source,
        task.contentId,
        content.authorId,
        ModerationDecision.HIDDEN,
        LexicalResult.BLOCKED,
        SemanticStatus.NOT_EVALUATED,
        lexicalCheck.detectedWords,
      );

      this.logger.debug(`Log guardado tras bloqueo léxico: ${log?.id}`);

      if (log) {
        this.emitPostCommitEvents(task.contentType, task.contentId, content, lexicalCheck.detectedWords, source.label);
      }
      return;
    }

    // 2. Capa 2: Filtro Semántico OpenAI (Fail-closed con 2 reintentos + fallback a local)
    try {
      const openAiResult = await this.openAiModeration.moderateText(content.text ?? '');

      if (openAiResult.flagged) {
        // Bloqueado por acoso o discurso de odio
        const log = await this.repository.completeTaskSuccess(
          task.id,
          lockToken,
          source,
          task.contentId,
          content.authorId,
          ModerationDecision.HIDDEN,
          LexicalResult.CLEAN,
          SemanticStatus.FLAGGED,
          openAiResult.categories,
        );

        if (log) {
          this.emitPostCommitEvents(task.contentType, task.contentId, content, openAiResult.categories, source.label);
        }
      } else {
        // Aprobado limpiamente por ambas capas
        await this.repository.completeTaskSuccess(
          task.id,
          lockToken,
          source,
          task.contentId,
          content.authorId,
          ModerationDecision.APPROVED,
          LexicalResult.CLEAN,
          openAiResult.available ? SemanticStatus.EVALUATED_CLEAN : SemanticStatus.DEGRADED_FALLBACK,
          [],
        );
      }
    } catch (err: unknown) {
      const isRecoverable = (err as { isRecoverable?: boolean }).isRecoverable ?? true;
      const currentAttempts = task.attempts + 1;
      const maxAttempts = task.maxAttempts || 3;

      if (isRecoverable && currentAttempts < maxAttempts) {
        // Reintentos con retardo: intento 1 -> 2s, intento 2 -> 5s
        const delaySec = currentAttempts === 1 ? 2 : 5;
        this.logger.warn(`Error recuperable en OpenAI para tarea ${task.id}. Programando reintento ${currentAttempts}/${maxAttempts} en ${delaySec}s.`);
        await this.repository.rescheduleTaskRetry(
          task.id,
          lockToken,
          currentAttempts,
          delaySec,
          err instanceof Error ? err.message : String(err),
        );

        // Despertador reactivo sin cron permanente: despierta al worker exactamente cuando venza el delay
        const timer = setTimeout(() => {
          this.processBatch().catch((error) =>
            this.logger.error('Error al procesar reintento programado', error),
          );
        }, (delaySec * 1000) + 100);

        if (timer && typeof timer.unref === 'function') {
          timer.unref();
        }
      } else {
        // Se agotaron los 2 reintentos o el error es permanente (e.g. sin API key o 401)
        // Aplicar fallback a filtro local: como el léxico fue limpio, se aprueba con DEGRADED_FALLBACK
        this.logger.warn(
          `Aplicando degradación controlada a filtro local para tarea ${task.id} tras ${currentAttempts} intentos. ` +
          `Contenido aprobado bajo DEGRADED_FALLBACK.`,
        );
        await this.repository.completeTaskSuccess(
          task.id,
          lockToken,
          source,
          task.contentId,
          content.authorId,
          ModerationDecision.APPROVED,
          LexicalResult.CLEAN,
          SemanticStatus.DEGRADED_FALLBACK,
          [],
        );
      }
    }
  }

  private emitPostCommitEvents(
    contentType: TargetContentType,
    contentId: string,
    content: { authorId: string; groupId: string | null },
    detectedWords: string[],
    label: string,
  ): void {
    if (contentType === TargetContentType.MESSAGE && content.groupId) {
      const hiddenMessage: ChatMessageHiddenEvent = {
        groupId: content.groupId,
        messageId: contentId,
      };
      this.events.emit(CHAT_MESSAGE_HIDDEN_EVENT, hiddenMessage);
    }

    const notification: ModerationNotificationEvent = {
      userId: content.authorId,
      title: MODERATION_MESSAGES.NOTIFICATION_TITLE,
      message:
        `Tu ${label} fue ocultada automáticamente por incumplir las normas comunitarias ` +
        `(${detectedWords.join(', ')}). Si crees que es un error, puedes apelar desde tu historial de moderación.`,
      type: 'MODERATION',
    };
    this.events.emit(NOTIFICATION_SEND_EVENT, notification);
  }
}
