import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonCacheModule } from '../../common/cache/common-cache.module';
import { CourseEntity } from './entities/course.entity';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CourseEntity]), CommonCacheModule],
  controllers: [CoursesController],
  providers: [CoursesRepository, CoursesService],
  exports: [CoursesRepository, CoursesService, TypeOrmModule],
})
export class CoursesModule {}
