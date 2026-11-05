import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PostEntity } from './entities/post.entity';
import { PostsRepository } from './posts.repository';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { CoursesModule } from '../courses/courses.module';
import { GroupMessagingModule } from '../group-messaging/group-messaging.module';
import { AuthModule } from '../auth-security/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PostEntity]),
    CoursesModule,
    GroupMessagingModule,
    AuthModule,
  ],
  controllers: [PostsController],
  providers: [
    PostsRepository,
    PostsService,
    { provide: 'EventEmitter', useExisting: EventEmitter2 },
  ],
  exports: [PostsRepository, PostsService, TypeOrmModule],
})
export class PostsModule {}
