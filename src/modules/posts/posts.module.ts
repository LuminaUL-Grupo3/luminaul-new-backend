import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from './entities/post.entity';
import { GroupEntity } from '../groups/entities/group.entity';
import { PostsRepository } from './posts.repository';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { CoursesModule } from '../courses/courses.module';
import { GroupsModule } from '../groups/groups.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PostEntity, GroupEntity]),
    CoursesModule,
    GroupsModule,
  ],
  controllers: [PostsController],
  providers: [PostsRepository, PostsService],
  exports: [PostsRepository, PostsService, TypeOrmModule],
})
export class PostsModule {}
