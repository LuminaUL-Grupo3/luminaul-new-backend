import { type Mocked } from 'vitest';
import { OpenAiModerationException, OpenAiModerationService } from '../../src/modules/moderation/service/openai-moderation.service';
import { ConfigService } from '@nestjs/config';

describe('OpenAiModerationService', () => {
  let service: OpenAiModerationService;
  let mockConfigService: Mocked<Partial<ConfigService>>;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn().mockReturnValue('test-api-key'),
    };
    service = new OpenAiModerationService(mockConfigService as ConfigService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debe degradar a fallback local si OPENAI_API_KEY no está configurada', async () => {
    const unconfiguredService = new OpenAiModerationService({
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);

    const result = await unconfiguredService.moderateText('Mensaje cualquiera');
    expect(result.available).toBe(false);
    expect(result.flagged).toBe(false);
    expect(result.isRecoverable).toBe(false);
    expect(result.error).toBe('OPENAI_API_KEY_MISSING');
  });

  it('debe detectar categorías bloqueadas cuando OpenAI retorna flagged', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        results: [
          {
            flagged: true,
            categories: {
              harassment: true,
              'harassment/threatening': false,
              hate: true,
              'hate/threatening': false,
              sexual: true,
              illicit: true,
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await service.moderateText('Mensaje con acoso');
    expect(result.available).toBe(true);
    expect(result.flagged).toBe(true);
    expect(result.categories).toEqual(['harassment', 'hate', 'sexual']);
  });

  it('debe retornar clean si ninguna de las BLOCKED_CATEGORIES está activa', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        results: [
          {
            flagged: false,
            categories: {
              harassment: false,
              'harassment/threatening': false,
              hate: false,
              'hate/threatening': false,
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await service.moderateText('Mensaje completamente limpio');
    expect(result.available).toBe(true);
    expect(result.flagged).toBe(false);
    expect(result.categories).toEqual([]);
  });

  it('debe bloquear cuando category_scores alcanza el umbral por defecto de 0.35 aunque categories sea false', async () => {
    const thresholdService = new OpenAiModerationService({
      get: vi.fn((key: string) => (key === 'OPENAI_API_KEY' ? 'test-api-key' : undefined)),
    } as unknown as ConfigService);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        results: [
          {
            flagged: false,
            categories: {
              harassment: false,
              'harassment/threatening': false,
              hate: false,
              'hate/threatening': false,
            },
            category_scores: {
              harassment: 0.35,
              'harassment/threatening': 0.02,
              hate: 0.34,
              'hate/threatening': 0.01,
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await thresholdService.moderateText('Comentario pasivo agresivo');
    expect(result.available).toBe(true);
    expect(result.flagged).toBe(true);
    expect(result.categories).toEqual(['harassment']);
  });

  it('debe respetar MODERATION_BLOCK_THRESHOLD personalizado si está configurado', async () => {
    const customService = new OpenAiModerationService({
      get: vi.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-api-key';
        if (key === 'MODERATION_BLOCK_THRESHOLD') return 0.5;
        return undefined;
      }),
    } as unknown as ConfigService);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        results: [
          {
            flagged: false,
            categories: {
              harassment: false,
              'harassment/threatening': false,
              hate: false,
              'hate/threatening': false,
            },
            category_scores: {
              harassment: 0.42,
              'harassment/threatening': 0.01,
              hate: 0.01,
              'hate/threatening': 0.01,
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await customService.moderateText('Texto límite debajo de 0.5');
    expect(result.flagged).toBe(false);
    expect(result.categories).toEqual([]);
  });

  it('no debe producir falso positivo si category_scores está debajo de 0.35 aunque categories sea true', async () => {
    const thresholdService = new OpenAiModerationService({
      get: vi.fn((key: string) => (key === 'OPENAI_API_KEY' ? 'test-api-key' : undefined)),
    } as unknown as ConfigService);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        results: [
          {
            flagged: true,
            categories: {
              harassment: false,
              'harassment/threatening': false,
              hate: false,
              'hate/threatening': false,
              violence: true,
            },
            category_scores: {
              harassment: 0.01,
              'harassment/threatening': 0.01,
              hate: 0.01,
              'hate/threatening': 0.01,
              violence: 0.2004,
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await thresholdService.moderateText('Oe chibolo, hay que meterle punche');
    expect(result.flagged).toBe(false);
    expect(result.categories).toEqual([]);
  });

  it('debe marcar como recuperables los errores HTTP 429 y 5xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    } as unknown as Response);

    await expect(service.moderateText('Test')).rejects.toThrow(OpenAiModerationException);
    try {
      await service.moderateText('Test');
    } catch (err) {
      expect((err as OpenAiModerationException).isRecoverable).toBe(true);
      expect((err as OpenAiModerationException).statusCode).toBe(429);
    }
  });

  it('debe marcar como no recuperables los errores HTTP 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as unknown as Response);

    try {
      await service.moderateText('Test');
    } catch (err) {
      expect((err as OpenAiModerationException).isRecoverable).toBe(false);
      expect((err as OpenAiModerationException).statusCode).toBe(401);
    }
  });
});

