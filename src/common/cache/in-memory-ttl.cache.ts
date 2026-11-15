import { Inject, Injectable, Optional } from '@nestjs/common';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_MAX_ENTRIES = 200;

/**
 * Caché en memoria con TTL e coalescencia de lecturas concurrentes (anti-stampede).
 * Diseñado para despliegues single-instance sin dependencias externas.
 */
@Injectable()
export class InMemoryTtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    @Optional()
    @Inject('IN_MEMORY_CACHE_MAX_ENTRIES')
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {}

  get size(): number {
    return this.store.size;
  }

  async getOrSet<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    if (ttlMs <= 0) {
      return loader();
    }

    const now = Date.now();
    const cached = this.store.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }

    if (cached) {
      this.store.delete(key);
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    const loadPromise = loader()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, loadPromise);
    return loadPromise;
  }

  invalidateKey(key: string): void {
    this.store.delete(key);
    this.inFlight.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
    for (const key of this.inFlight.keys()) {
      if (key.startsWith(prefix)) {
        this.inFlight.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
    this.inFlight.clear();
  }

  private set<T>(key: string, value: T, ttlMs: number): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      this.evictOldestOrExpired();
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  private evictOldestOrExpired(): void {
    const now = Date.now();
    for (const [entryKey, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(entryKey);
      }
    }

    while (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.store.delete(oldestKey);
    }
  }
}

