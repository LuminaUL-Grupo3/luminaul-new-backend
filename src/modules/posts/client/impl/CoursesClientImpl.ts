import { Injectable } from '@nestjs/common';
import { CoursesClient, CourseData } from '../CoursesClient';
import { CoursesRepository } from '../../../courses/courses.repository';

@Injectable()
export class CoursesClientImpl extends CoursesClient {
  constructor(private readonly coursesRepository: CoursesRepository) {
    super();
  }

  async findById(courseId: string): Promise<CourseData | null> {
    const course = await this.coursesRepository.findById(courseId);
    if (!course) return null;
    return {
      id: course.id,
      name: course.name,
      cycle: course.cycle ?? null,
    };
  }
}
