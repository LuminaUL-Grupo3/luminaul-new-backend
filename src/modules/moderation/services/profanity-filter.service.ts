import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ModerationRepository } from '../repositories/moderation.repository';
import { findBannedWords, normalizeText } from './lexical-filter';

@Injectable()
export class ProfanityFilterService {
  private readonly logger = new Logger(ProfanityFilterService.name);
  private cachedBannedWords: string[] | null = null;
  private lastCacheTime = 0;
  private readonly ttlMs = 5 * 60 * 1000; // 5 minutos de TTL

  constructor(private readonly repository: ModerationRepository) { }

  async getBannedWords(): Promise<string[]> {
    const now = Date.now();
    if (this.cachedBannedWords && now - this.lastCacheTime < this.ttlMs) {
      return this.cachedBannedWords;
    }

    try {
      this.cachedBannedWords = await this.repository.listBannedWords();
      this.lastCacheTime = now;
      this.logger.debug(`Caché de banned_words actualizada con ${this.cachedBannedWords.length} términos.`);
    } catch (error) {
      this.logger.error('Error al cargar banned_words de la base de datos', error);
      if (this.cachedBannedWords) {
        return this.cachedBannedWords;
      }
      return [];
    }

    return this.cachedBannedWords;
  }

  async checkMessage(text: string): Promise<{ clean: boolean; detectedWords: string[] }> {
    const words = await this.getBannedWords();
    const detectedWords = findBannedWords(text, words);
    return {
      clean: detectedWords.length === 0,
      detectedWords,
    };
  }

  normalize(text: string): string {
    return normalizeText(text);
  }

  @OnEvent('banned_words.updated')
  invalidateCache(): void {
    this.cachedBannedWords = null;
    this.lastCacheTime = 0;
    this.logger.debug('Caché de banned_words invalidada manualmente.');
  }
}


