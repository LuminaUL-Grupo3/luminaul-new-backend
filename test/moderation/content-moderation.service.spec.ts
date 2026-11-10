import { type Mocked } from 'vitest';
import { ContentModerationService } from '../../src/modules/moderation/services/content-moderation.service';
import { ModerationRepository } from '../../src/modules/moderation/repositories/moderation.repository';
import { ModerationTaskWorkerService } from '../../src/modules/moderation/services/moderation-task-worker.service';
import { TargetContentType } from '../../src/modules/moderation/enums/moderation.enums';

describe('SPEC-06 ContentModerationService', () => {
  const AUTHOR = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
  const CONTENT = '18938a12-6f2b-4d43-9801-bca908234fed';

  let repository: Mocked<Pick<ModerationRepository, 'enqueueTask'>>;
  let worker: Mocked<Pick<ModerationTaskWorkerService, 'processBatch'>>;
  let service: ContentModerationService;

  beforeEach(() => {
    repository = {
      enqueueTask: vi.fn().mockResolvedValue({ id: 'task-1' } as any),
    };
    worker = {
      processBatch: vi.fn().mockResolvedValue(1),
    };
    service = new ContentModerationService(
      repository as unknown as ModerationRepository,
      worker as unknown as ModerationTaskWorkerService,
    );
  });

  it('encola la tarea en PostgreSQL y despierta al worker para procesar el lote', async () => {
    await service.enqueueAndProcess({
      contentType: TargetContentType.PUBLICATION,
      contentId: CONTENT,
      authorId: AUTHOR,
      text: 'Texto de prueba',
    });

    expect(repository.enqueueTask).toHaveBeenCalledWith(
      TargetContentType.PUBLICATION,
      CONTENT,
    );
    expect(worker.processBatch).toHaveBeenCalledTimes(1);
  });

  it('encola mensajes y activa el worker de forma asíncrona', async () => {
    await service.enqueueAndProcess({
      contentType: TargetContentType.MESSAGE,
      contentId: CONTENT,
      authorId: AUTHOR,
      text: 'Mensaje de chat',
    });

    expect(repository.enqueueTask).toHaveBeenCalledWith(
      TargetContentType.MESSAGE,
      CONTENT,
    );
    expect(worker.processBatch).toHaveBeenCalledTimes(1);
  });
});
