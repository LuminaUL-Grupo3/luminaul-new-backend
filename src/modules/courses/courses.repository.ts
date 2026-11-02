import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseEntity } from './entities/course.entity';

@Injectable()
export class CoursesRepository {
  constructor(
    @InjectRepository(CourseEntity)
    private readonly repository: Repository<CourseEntity>,
  ) {}

  async getAll(): Promise<CourseEntity[]> {
    return this.repository.find({
      order: {
        name: 'ASC',
      },
    });
  }

  async findById(id: string): Promise<CourseEntity | null> {
    return this.repository.findOne({
      where: { id },
    });
  }
}
