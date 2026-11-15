import { InMemoryTtlCache } from '../in-memory-ttl.cache';

describe('InMemoryTtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches values until TTL expires and reloads afterwards', async () => {
    const cache = new InMemoryTtlCache();
    let count = 0;
    const loader = vi.fn(async () => ++count);

    expect(await cache.getOrSet('courses:all', 5_000, loader)).toBe(1);
    expect(await cache.getOrSet('courses:all', 5_000, loader)).toBe(1);
    expect(loader).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_001);

    expect(await cache.getOrSet('courses:all', 5_000, loader)).toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent reads for the same cache key (anti-stampede)', async () => {
    const cache = new InMemoryTtlCache();
    let resolveLoader: ((value: string) => void) | undefined;
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoader = resolve;
        }),
    );

    const p1 = cache.getOrSet('posts:feed:limit=15|offset=0', 20_000, loader);
    const p2 = cache.getOrSet('posts:feed:limit=15|offset=0', 20_000, loader);

    expect(loader).toHaveBeenCalledTimes(1);
    resolveLoader?.('shared-result');

    expect(await Promise.all([p1, p2])).toEqual([
      'shared-result',
      'shared-result',
    ]);
  });

  it('evicts oldest keys when reaching bounded capacity', async () => {
    const cache = new InMemoryTtlCache(2);

    await cache.getOrSet('k1', 10_000, async () => 'v1');
    await cache.getOrSet('k2', 10_000, async () => 'v2');
    await cache.getOrSet('k3', 10_000, async () => 'v3');

    expect(cache.size).toBe(2);

    const k1Reload = vi.fn(async () => 'v1-reloaded');
    const k3Reload = vi.fn(async () => 'v3-reloaded');

    expect(await cache.getOrSet('k3', 10_000, k3Reload)).toBe('v3');
    expect(k3Reload).not.toHaveBeenCalled();

    expect(await cache.getOrSet('k1', 10_000, k1Reload)).toBe('v1-reloaded');
    expect(k1Reload).toHaveBeenCalledTimes(1);
  });

  it('invalidates only keys matching a prefix', async () => {
    const cache = new InMemoryTtlCache();

    await cache.getOrSet('posts:feed:limit=10|offset=0', 10_000, async () => 'p1');
    await cache.getOrSet('courses:all', 10_000, async () => 'c1');

    cache.invalidatePrefix('posts:feed:');

    const feedLoader = vi.fn(async () => 'p2');
    const coursesLoader = vi.fn(async () => 'c2');

    expect(
      await cache.getOrSet('posts:feed:limit=10|offset=0', 10_000, feedLoader),
    ).toBe('p2');
    expect(await cache.getOrSet('courses:all', 10_000, coursesLoader)).toBe('c1');
    expect(feedLoader).toHaveBeenCalledTimes(1);
    expect(coursesLoader).not.toHaveBeenCalled();
  });
});

