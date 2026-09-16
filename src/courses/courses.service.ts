import { Injectable } from '@nestjs/common';
import { CoursesRepository } from './courses.repository';
import { CourseResponseDto } from './dto/course-response.dto';

@Injectable()
export class CoursesService {
  constructor(private readonly coursesRepository: CoursesRepository) {}

  async getCourses(): Promise<CourseResponseDto[]> {
    const courses = await this.coursesRepository.getAll();
    return courses.map((course) => ({
      id: course.id,
      name: course.name,
      cycle: course.cycle,
    }));
  }
}
