import { type Mocked } from 'vitest';
import { InMemoryTtlCache } from '../../../common/cache/in-memory-ttl.cache';
import { CoursesRepository } from '../courses.repository';
import { CoursesService } from '../courses.service';

describe('CoursesService caching (Parte B)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves GET /courses from cache within 30s TTL and returns cloned DTOs', async () => {
    const mockRepo: Mocked<Pick<CoursesRepository, 'getAll'>> = {
      getAll: vi.fn().mockResolvedValue([
        {
          id: '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
          name: 'Ingeniería de Software I',
          cycle: 5,
        },
      ]),
    };

    const cache = new InMemoryTtlCache();
    const service = new CoursesService(
      mockRepo as unknown as CoursesRepository,
      cache,
    );

    const first = await service.getCourses();
    first[0].name = 'Mutated by caller';
    first.push({ id: 'extra', name: 'Extra', cycle: 1 });

    const second = await service.getCourses();

    expect(mockRepo.getAll).toHaveBeenCalledTimes(1);
    expect(second).toEqual([
      {
        id: '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
        name: 'Ingeniería de Software I',
        cycle: 5,
      },
    ]);

    vi.advanceTimersByTime(30_001);
    await service.getCourses();
    expect(mockRepo.getAll).toHaveBeenCalledTimes(2);
  });
});

