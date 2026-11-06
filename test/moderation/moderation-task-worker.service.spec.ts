import { ModerationTaskWorkerService } from '../../src/modules/moderation/services/moderation-task-worker.service';
import { ModerationRepository } from '../../src/modules/moderation/repositories/moderation.repository';
import { ProfanityFilterService } from '../../src/modules/moderation/services/profanity-filter.service';
import { OpenAiModerationException, OpenAiModerationService } from '../../src/modules/moderation/services/openai-moderation.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  LexicalResult,
  ModerationDecision,
  SemanticStatus,
  TargetContentType,
} from '../../src/modules/moderation/enums/moderation.enums';

describe('ModerationTaskWorkerService', () => {
  let worker: ModerationTaskWorkerService;
  let mockRepo: jest.Mocked<Partial<ModerationRepository>>;
  let mockProfanity: jest.Mocked<Partial<ProfanityFilterService>>;
  let mockOpenAi: jest.Mocked<Partial<OpenAiModerationService>>;
  let mockEvents: { emit: jest.Mock };

  beforeEach(() => {
    mockRepo = {
      claimNextBatch: jest.fn(),
      findContent: jest.fn(),
      completeTaskSuccess: jest.fn(),
      rescheduleTaskRetry: jest.fn(),
    };
    mockProfanity = {
      checkMessage: jest.fn(),
    };
    mockOpenAi = {
      moderateText: jest.fn(),
    };
    mockEvents = { emit: jest.fn() };

    worker = new ModerationTaskWorkerService(
      mockRepo as unknown as ModerationRepository,
      mockProfanity as unknown as ProfanityFilterService,
      mockOpenAi as unknown as OpenAiModerationService,
      mockEvents as unknown as EventEmitter2,
    );
  });

  it('debe ocultar inmediatamente si la Capa 1 léxica detecta palabras prohibidas sin llamar a OpenAI', async () => {
    mockRepo.claimNextBatch = jest.fn().mockResolvedValue([
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
    mockRepo.findContent = jest.fn().mockResolvedValue({
      authorId: 'user-1',
      groupId: null,
      status: 'pending_moderation',
      text: 'Este contenido es una estafa total',
    });
    mockProfanity.checkMessage = jest.fn().mockResolvedValue({
      clean: false,
      detectedWords: ['estafa'],
    });
    mockRepo.completeTaskSuccess = jest.fn().mockResolvedValue({ id: 'log-1' } as unknown as null);

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
    mockRepo.claimNextBatch = jest.fn().mockResolvedValue([
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
    mockRepo.findContent = jest.fn().mockResolvedValue({
      authorId: 'user-2',
      groupId: null,
      status: 'pending_moderation',
      text: 'Grupo de estudio de algoritmos',
    });
    mockProfanity.checkMessage = jest.fn().mockResolvedValue({
      clean: true,
      detectedWords: [],
    });
    mockOpenAi.moderateText = jest.fn().mockResolvedValue({
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
    mockRepo.claimNextBatch = jest.fn().mockResolvedValue([
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
    mockRepo.findContent = jest.fn().mockResolvedValue({
      authorId: 'user-3',
      groupId: null,
      status: 'pending_moderation',
      text: 'Texto con acoso y odio',
    });
    mockProfanity.checkMessage = jest.fn().mockResolvedValue({
      clean: true,
      detectedWords: [],
    });
    mockOpenAi.moderateText = jest.fn().mockResolvedValue({
      available: true,
      flagged: true,
      categories: ['harassment'],
    });
    mockRepo.completeTaskSuccess = jest.fn().mockResolvedValue({ id: 'log-3' } as unknown as null);

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
    mockRepo.claimNextBatch = jest.fn().mockResolvedValue([
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
    mockRepo.findContent = jest.fn().mockResolvedValue({
      authorId: 'user-4',
      groupId: null,
      status: 'pending_moderation',
      text: 'Consulta de matemáticas',
    });
    mockProfanity.checkMessage = jest.fn().mockResolvedValue({ clean: true, detectedWords: [] });
    mockOpenAi.moderateText = jest.fn().mockRejectedValue(new OpenAiModerationException('Timeout', true));

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
    mockRepo.claimNextBatch = jest.fn().mockResolvedValue([
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
    mockRepo.findContent = jest.fn().mockResolvedValue({
      authorId: 'user-5',
      groupId: null,
      status: 'pending_moderation',
      text: 'Consulta legítima con OpenAI caído',
    });
    mockProfanity.checkMessage = jest.fn().mockResolvedValue({ clean: true, detectedWords: [] });
    mockOpenAi.moderateText = jest.fn().mockRejectedValue(new OpenAiModerationException('503 Service Unavailable', true));

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
});

