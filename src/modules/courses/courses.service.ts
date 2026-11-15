import { Injectable, Optional } from '@nestjs/common';
import { InMemoryTtlCache } from '../../common/cache/in-memory-ttl.cache';
import { CoursesRepository } from './courses.repository';
import { CourseResponseDto } from './dto/course-response.dto';

const COURSES_ALL_CACHE_KEY = 'courses:all';
const COURSES_CACHE_TTL_MS = 30_000;

@Injectable()
export class CoursesService {
  constructor(
    private readonly coursesRepository: CoursesRepository,
    @Optional() private readonly cache?: InMemoryTtlCache,
  ) {}

  async getCourses(): Promise<CourseResponseDto[]> {
    const courses = this.cache
      ? await this.cache.getOrSet(COURSES_ALL_CACHE_KEY, COURSES_CACHE_TTL_MS, () =>
          this.loadCourseDtos(),
        )
      : await this.loadCourseDtos();

    return courses.map((course) => ({ ...course }));
  }

  private async loadCourseDtos(): Promise<CourseResponseDto[]> {
    const courses = await this.coursesRepository.getAll();
    return courses.map((course) => ({
      id: course.id,
      name: course.name,
      cycle: course.cycle,
    }));
  }
}
