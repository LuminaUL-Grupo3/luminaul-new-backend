import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const BLOCKED_CATEGORIES = [
  'harassment',
  'harassment/threatening',
  'hate',
  'hate/threatening',
] as const;

export interface OpenAiCheckResult {
  available: boolean;
  flagged: boolean;
  categories: string[];
  isRecoverable?: boolean;
  error?: string;
}

export class OpenAiModerationException extends Error {
  constructor(
    message: string,
    public readonly isRecoverable: boolean,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'OpenAiModerationException';
  }
}

@Injectable()
export class OpenAiModerationService {
  private readonly logger = new Logger(OpenAiModerationService.name);
  private readonly apiKey?: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY');
  }

  async moderateText(text: string): Promise<OpenAiCheckResult> {
    if (!this.apiKey) {
      this.logger.warn('OPENAI_API_KEY no configurada. Degradando a evaluación léxica local.');
      return {
        available: false,
        flagged: false,
        categories: [],
        isRecoverable: false,
        error: 'OPENAI_API_KEY_MISSING',
      };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'omni-moderation-latest',
          input: text,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const isRecoverable = response.status === 429 || response.status >= 500;
        throw new OpenAiModerationException(
          `OpenAI API devolvió HTTP ${response.status}`,
          isRecoverable,
          response.status,
        );
      }

      const data = await response.json();
      const firstResult = data?.results?.[0];

      if (!firstResult || typeof firstResult.categories !== 'object') {
        throw new OpenAiModerationException('Formato de respuesta inesperado de OpenAI', false);
      }

      const detectedCategories = BLOCKED_CATEGORIES.filter(
        (category) => firstResult.categories[category] === true,
      );

      const flagged = detectedCategories.length > 0;

      return {
        available: true,
        flagged,
        categories: detectedCategories,
      };
    } catch (err: unknown) {
      if (err instanceof OpenAiModerationException) {
        throw err;
      }

      const isTimeout = (err as { name?: string }).name === 'TimeoutError';
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Error al conectar con OpenAI Moderation API: ${errorMessage}`);

      // Errores de red o timeout son recuperables
      throw new OpenAiModerationException(errorMessage, true);
    }
  }
}

