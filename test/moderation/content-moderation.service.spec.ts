import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContentModerationService } from '../../src/modules/moderation/services/content-moderation.service';
import { ModerationRepository } from '../../src/modules/moderation/repositories/moderation.repository';
import { TargetContentType } from '../../src/modules/moderation/enums/moderation.enums';
import { CHAT_MESSAGE_HIDDEN_EVENT, NOTIFICATION_SEND_EVENT } from '../../src/modules/moderation/moderation.constants';

describe('SPEC-06 ContentModerationService', () => {
  const AUTHOR = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
  const GROUP = '7b134111-9a22-48df-9fa0-cd8213aa0981';
  const CONTENT = '18938a12-6f2b-4d43-9801-bca908234fed';

  let repository: jest.Mocked<
    Pick<ModerationRepository, 'listBannedWords' | 'findContent' | 'hideAndSaveLog'>
  >;
  let events: { emit: jest.Mock };
  let service: ContentModerationService;

  beforeEach(() => {
    repository = {
      listBannedWords: jest.fn().mockResolvedValue(['estafa', 'spam']),
      findContent: jest.fn().mockResolvedValue({ authorId: AUTHOR, groupId: GROUP, status: 'published' }),
      hideAndSaveLog: jest.fn().mockResolvedValue({ id: 'log-1' } as any),
    };
    events = { emit: jest.fn() };
    service = new ContentModerationService(
      repository as unknown as ModerationRepository,
      events as unknown as EventEmitter2,
    );
  });

  it('no toca la base si el texto es limpio', async () => {
    const outcome = await service.moderate({
      contentType: TargetContentType.PUBLICATION,
      contentId: CONTENT,
      authorId: AUTHOR,
      text: 'Repaso de cálculo',
    });
    expect(outcome).toEqual({ status: 'clean' });
    expect(repository.hideAndSaveLog).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('oculta, registra y notifica al autor una publicación infractora', async () => {
    const outcome = await service.moderate({
      contentType: TargetContentType.PUBLICATION,
      contentId: CONTENT,
      authorId: AUTHOR,
      text: 'Es una estafa',
    });
    expect(outcome).toEqual({ status: 'hidden', moderationLogId: 'log-1', detectedWords: ['estafa'] });
    expect(repository.hideAndSaveLog).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'publications' }),
      'publication',
      CONTENT,
      AUTHOR,
      ['estafa'],
    );
    expect(events.emit).toHaveBeenCalledWith(
      NOTIFICATION_SEND_EVENT,
      expect.objectContaining({ userId: AUTHOR, type: 'MODERATION' }),
    );
    expect(events.emit).not.toHaveBeenCalledWith(CHAT_MESSAGE_HIDDEN_EVENT, expect.anything());
  });

  it('avisa al chat cuando el contenido oculto es un mensaje', async () => {
    await service.moderate({
      contentType: TargetContentType.MESSAGE,
      contentId: CONTENT,
      authorId: AUTHOR,
      text: 'Mucho spam en este canal',
    });
    expect(events.emit).toHaveBeenCalledWith(CHAT_MESSAGE_HIDDEN_EVENT, {
      groupId: GROUP,
      messageId: CONTENT,
    });
  });
});

