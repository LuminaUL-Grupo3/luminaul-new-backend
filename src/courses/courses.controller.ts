import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { CourseResponseDto } from './dto/course-response.dto';

@ApiTags('Courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todos los cursos ordenados alfabéticamente' })
  @ApiResponse({
    status: 200,
    description: 'Lista completa de cursos',
    type: [CourseResponseDto],
  })
  async getAllCourses(): Promise<CourseResponseDto[]> {
    return this.coursesService.getCourses();
  }
}
