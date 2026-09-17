import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseEntity } from './entities/course.entity';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CourseEntity])],
  controllers: [CoursesController],
  providers: [CoursesRepository, CoursesService],
  exports: [CoursesRepository, CoursesService, TypeOrmModule],
})
export class CoursesModule {}
