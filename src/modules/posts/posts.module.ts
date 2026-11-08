import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from './entities/post.entity';
import { PostsRepository } from './posts.repository';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { CoursesModule } from '../courses/courses.module';
import { GroupMessagingModule } from '../group-messaging/group-messaging.module';
import { AuthModule } from '../auth-security/auth.module';

// Adapters (Puertos e implementaciones)
import { CoursesClient } from './client/CoursesClient';
import { CoursesClientImpl } from './client/impl/CoursesClientImpl';
import { GroupMessagingClient } from './client/GroupMessagingClient';
import { GroupMessagingClientImpl } from './client/impl/GroupMessagingClientImpl';
import { ModerationClient } from './client/ModerationClient';
import { ModerationClientImpl } from './client/impl/ModerationClientImpl';

// Factory Method (Creadores y Factory Dispatcher)
import { StudyGroupPostCreator } from './factory/impl/StudyGroupPostCreator';
import { TutoringPostCreator } from './factory/impl/TutoringPostCreator';
import { PostCreatorFactory } from './factory/PostCreatorFactory';

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
    // Providers de Adaptadores
    { provide: CoursesClient, useClass: CoursesClientImpl },
    { provide: GroupMessagingClient, useClass: GroupMessagingClientImpl },
    { provide: ModerationClient, useClass: ModerationClientImpl },
    // Providers de Factory Method
    StudyGroupPostCreator,
    TutoringPostCreator,
    PostCreatorFactory,
  ],
  exports: [
    PostsRepository,
    PostsService,
    TypeOrmModule,
    CoursesClient,
    GroupMessagingClient,
    ModerationClient,
    PostCreatorFactory,
  ],
})
export class PostsModule { }
