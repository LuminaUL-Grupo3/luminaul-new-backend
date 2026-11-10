import { type Mock, type Mocked } from 'vitest';
import { ModerationTaskWorkerService } from '../../src/modules/moderation/service/moderation-task-worker.service';
import { ModerationRepository } from '../../src/modules/moderation/repository/moderation.repository';
import { ProfanityFilterService } from '../../src/modules/moderation/service/profanity-filter.service';
import { OpenAiModerationException, OpenAiModerationService } from '../../src/modules/moderation/service/openai-moderation.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  LexicalResult,
  ModerationDecision,
  SemanticStatus,
  TargetContentType,
} from '../../src/modules/moderation/enums/moderation.enums';

describe('ModerationTaskWorkerService', () => {
  let worker: ModerationTaskWorkerService;
  let mockRepo: Mocked<Partial<ModerationRepository>>;
  let mockProfanity: Mocked<Partial<ProfanityFilterService>>;
  let mockOpenAi: Mocked<Partial<OpenAiModerationService>>;
  let mockEvents: { emit: Mock };

  beforeEach(() => {
    mockRepo = {
      claimNextBatch: vi.fn(),
      findContent: vi.fn(),
      completeTaskSuccess: vi.fn(),
      completeTaskDiscarded: vi.fn(),
      rescheduleTaskRetry: vi.fn(),
    };
    mockProfanity = {
      checkMessage: vi.fn(),
    };
    mockOpenAi = {
      moderateText: vi.fn(),
    };
    mockEvents = { emit: vi.fn() };

    worker = new ModerationTaskWorkerService(
      mockRepo as unknown as ModerationRepository,
      mockProfanity as unknown as ProfanityFilterService,
      mockOpenAi as unknown as OpenAiModerationService,
      mockEvents as unknown as EventEmitter2,
    );
  });

  it('debe ocultar inmediatamente si la Capa 1 léxica detecta palabras prohibidas sin llamar a OpenAI', async () => {
    mockRepo.claimNextBatch = vi.fn().mockResolvedValue([
      {
        id: 'task-1',
        contentType: TargetContentType.PUBLICATION,
        contentId: 'pub-1',
        contentVersion: 1,
        attempts: 0,
        maxAttempts: 3,
        lockToken: 'token-abc',
      },
    ]);
    mockRepo.findContent = vi.fn().mockResolvedValue({
      authorId: 'user-1',
      groupId: null,
      status: 'pending_moderation',
      text: 'Este contenido es una estafa total',
    });
    mockProfanity.checkMessage = vi.fn().mockResolvedValue({
      clean: false,
      detectedWords: ['estafa'],
    });
    mockRepo.completeTaskSuccess = vi.fn().mockResolvedValue({ id: 'log-1' } as unknown as null);

    const processedCount = await worker.processBatch();

    expect(processedCount).toBe(1);
    expect(mockProfanity.checkMessage).toHaveBeenCalledWith('Este contenido es una estafa total');
    expect(mockOpenAi.moderateText).not.toHaveBeenCalled();
    expect(mockRepo.completeTaskSuccess).toHaveBeenCalledWith(
      'task-1',
      'token-abc',
      expect.anything(),
      'pub-1',
      'user-1',
      ModerationDecision.HIDDEN,
      LexicalResult.BLOCKED,
      SemanticStatus.NOT_EVALUATED,
      ['estafa'],
    );
    expect(mockEvents.emit).toHaveBeenCalledWith(
      'notification.send',
      expect.objectContaining({ userId: 'user-1', type: 'MODERATION' }),
    );
  });

  it('debe aprobar el contenido si la Capa 1 y la Capa 2 resultan limpias', async () => {
    mockRepo.claimNextBatch = vi.fn().mockResolvedValue([
      {
        id: 'task-2',
        contentType: TargetContentType.PUBLICATION,
        contentId: 'pub-2',
        contentVersion: 1,
        attempts: 0,
        maxAttempts: 3,
        lockToken: 'token-xyz',
      },
    ]);
    mockRepo.findContent = vi.fn().mockResolvedValue({
      authorId: 'user-2',
      groupId: null,
      status: 'pending_moderation',
      text: 'Grupo de estudio de algoritmos',
    });
    mockProfanity.checkMessage = vi.fn().mockResolvedValue({
      clean: true,
      detectedWords: [],
    });
    mockOpenAi.moderateText = vi.fn().mockResolvedValue({
      available: true,
      flagged: false,
      categories: [],
    });

    const processedCount = await worker.processBatch();

    expect(processedCount).toBe(1);
    expect(mockOpenAi.moderateText).toHaveBeenCalledWith('Grupo de estudio de algoritmos');
    expect(mockRepo.completeTaskSuccess).toHaveBeenCalledWith(
      'task-2',
      'token-xyz',
      expect.anything(),
      'pub-2',
      'user-2',
      ModerationDecision.APPROVED,
      LexicalResult.CLEAN,
      SemanticStatus.EVALUATED_CLEAN,
      [],
    );
    expect(mockEvents.emit).not.toHaveBeenCalled();
  });

  it('debe ocultar el contenido si la Capa 2 de OpenAI detecta acoso u odio', async () => {
    mockRepo.claimNextBatch = vi.fn().mockResolvedValue([
      {
        id: 'task-3',
        contentType: TargetContentType.PUBLICATION,
        contentId: 'pub-3',
        contentVersion: 1,
        attempts: 0,
        maxAttempts: 3,
        lockToken: 'token-hate',
      },
    ]);
    mockRepo.findContent = vi.fn().mockResolvedValue({
      authorId: 'user-3',
      groupId: null,
      status: 'pending_moderation',
      text: 'Texto con acoso y odio',
    });
    mockProfanity.checkMessage = vi.fn().mockResolvedValue({
      clean: true,
      detectedWords: [],
    });
    mockOpenAi.moderateText = vi.fn().mockResolvedValue({
      available: true,
      flagged: true,
      categories: ['harassment'],
    });
    mockRepo.completeTaskSuccess = vi.fn().mockResolvedValue({ id: 'log-3' } as unknown as null);

    const processedCount = await worker.processBatch();

    expect(processedCount).toBe(1);
    expect(mockRepo.completeTaskSuccess).toHaveBeenCalledWith(
      'task-3',
      'token-hate',
      expect.anything(),
      'pub-3',
      'user-3',
      ModerationDecision.HIDDEN,
      LexicalResult.CLEAN,
      SemanticStatus.FLAGGED,
      ['harassment'],
    );
    expect(mockEvents.emit).toHaveBeenCalledWith(
      'notification.send',
      expect.objectContaining({ userId: 'user-3' }),
    );
  });

  it('debe programar reintento con backoff ante fallo recuperable de OpenAI si no agotó maxAttempts', async () => {
    mockRepo.claimNextBatch = vi.fn().mockResolvedValue([
      {
        id: 'task-4',
        contentType: TargetContentType.PUBLICATION,
        contentId: 'pub-4',
        contentVersion: 1,
        attempts: 0,
        maxAttempts: 3,
        lockToken: 'token-err1',
      },
    ]);
    mockRepo.findContent = vi.fn().mockResolvedValue({
      authorId: 'user-4',
      groupId: null,
      status: 'pending_moderation',
      text: 'Consulta de matemáticas',
    });
    mockProfanity.checkMessage = vi.fn().mockResolvedValue({ clean: true, detectedWords: [] });
    mockOpenAi.moderateText = vi.fn().mockRejectedValue(new OpenAiModerationException('Timeout', true));

    await worker.processBatch();

    expect(mockRepo.rescheduleTaskRetry).toHaveBeenCalledWith(
      'task-4',
      'token-err1',
      1,
      2,
      'Timeout',
    );
    expect(mockRepo.completeTaskSuccess).not.toHaveBeenCalled();
  });

  it('debe aplicar fallback al filtro local tras agotar los 2 reintentos de OpenAI', async () => {
    mockRepo.claimNextBatch = vi.fn().mockResolvedValue([
      {
        id: 'task-5',
        contentType: TargetContentType.PUBLICATION,
        contentId: 'pub-5',
        contentVersion: 1,
        attempts: 2,
        maxAttempts: 3,
        lockToken: 'token-err3',
      },
    ]);
    mockRepo.findContent = vi.fn().mockResolvedValue({
      authorId: 'user-5',
      groupId: null,
      status: 'pending_moderation',
      text: 'Consulta legítima con OpenAI caído',
    });
    mockProfanity.checkMessage = vi.fn().mockResolvedValue({ clean: true, detectedWords: [] });
    mockOpenAi.moderateText = vi.fn().mockRejectedValue(new OpenAiModerationException('503 Service Unavailable', true));

    await worker.processBatch();

    expect(mockRepo.rescheduleTaskRetry).not.toHaveBeenCalled();
    expect(mockRepo.completeTaskSuccess).toHaveBeenCalledWith(
      'task-5',
      'token-err3',
      expect.anything(),
      'pub-5',
      'user-5',
      ModerationDecision.APPROVED,
      LexicalResult.CLEAN,
      SemanticStatus.DEGRADED_FALLBACK,
      [],
    );
  });

  it('debe descartar la tarea sin insertar log falso si el contenido fue eliminado antes de procesarse', async () => {
    mockRepo.claimNextBatch = vi.fn().mockResolvedValue([
      {
        id: 'task-deleted',
        contentType: TargetContentType.PUBLICATION,
        contentId: 'pub-deleted',
        contentVersion: 1,
        attempts: 0,
        maxAttempts: 3,
        lockToken: 'token-del',
      },
    ]);
    mockRepo.findContent = vi.fn().mockResolvedValue(null);
    mockRepo.completeTaskDiscarded = vi.fn().mockResolvedValue(true);

    const processedCount = await worker.processBatch();

    expect(processedCount).toBe(1);
    expect(mockRepo.completeTaskDiscarded).toHaveBeenCalledWith(
      'task-deleted',
      'token-del',
      'CONTENT_DELETED_OR_NOT_FOUND',
    );
    expect(mockRepo.completeTaskSuccess).not.toHaveBeenCalled();
  });
});

