import { ProfanityFilterService } from './profanity-filter.service';
import { ModerationRepository } from '../repositories/moderation.repository';

describe('ProfanityFilterService', () => {
  let service: ProfanityFilterService;
  let mockRepository: jest.Mocked<Partial<ModerationRepository>>;

  beforeEach(() => {
    mockRepository = {
      listBannedWords: jest.fn().mockResolvedValue(['estafa', 'fraude', 'plagio']),
    };
    service = new ProfanityFilterService(mockRepository as unknown as ModerationRepository);
  });

  it('debe consultar la base de datos en la primera llamada y cachear los términos', async () => {
    const res1 = await service.checkMessage('Mensaje limpio sin problemas');
    expect(res1.clean).toBe(true);
    expect(res1.detectedWords).toEqual([]);
    expect(mockRepository.listBannedWords).toHaveBeenCalledTimes(1);

    // Segunda llamada dentro del TTL debe usar la caché
    const res2 = await service.checkMessage('Otro mensaje limpio');
    expect(res2.clean).toBe(true);
    expect(mockRepository.listBannedWords).toHaveBeenCalledTimes(1);
  });

  it('debe detectar palabras prohibidas usando el filtro léxico', async () => {
    const res = await service.checkMessage('Cuidado con el fr4ude');
    expect(res.clean).toBe(false);
    expect(res.detectedWords).toEqual(['fraude']);
  });

  it('debe recargar de la base de datos al invalidar la caché', async () => {
    await service.getBannedWords();
    expect(mockRepository.listBannedWords).toHaveBeenCalledTimes(1);

    service.invalidateCache();

    await service.getBannedWords();
    expect(mockRepository.listBannedWords).toHaveBeenCalledTimes(2);
  });
});
