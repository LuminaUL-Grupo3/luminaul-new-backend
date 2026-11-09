import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from './entities/post.entity';
import { PostsRepository } from './repository/PostsRepository';
import { PostsRepositoryImpl } from './repository/impl/PostsRepositoryImpl';
import { PostsService } from './service/PostsService';
import { PostsServiceImpl } from './service/impl/PostsServiceImpl';
import { PostsController } from './controller/PostsController';
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
import { PostCreator } from './factory/PostCreator';
import { StudyGroupPostCreator } from './factory/impl/StudyGroupPostCreator';
import { TutoringPostCreator } from './factory/impl/TutoringPostCreator';
import { PostCreatorFactory } from './factory/PostCreatorFactory';
import { POST_CREATORS } from './posts.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([PostEntity]),
    CoursesModule,
    GroupMessagingModule,
    AuthModule,
  ],
  controllers: [PostsController],
  providers: [
    // Inversión de dependencias para capas Service y Repository
    { provide: PostsService, useClass: PostsServiceImpl },
    { provide: PostsRepository, useClass: PostsRepositoryImpl },
    // Providers de Adaptadores
    { provide: CoursesClient, useClass: CoursesClientImpl },
    { provide: GroupMessagingClient, useClass: GroupMessagingClientImpl },
    { provide: ModerationClient, useClass: ModerationClientImpl },
    // Providers de Factory Method
    StudyGroupPostCreator,
    TutoringPostCreator,
    {
      provide: POST_CREATORS,
      useFactory: (...creators: PostCreator[]) => creators,
      inject: [StudyGroupPostCreator, TutoringPostCreator],
    },
    PostCreatorFactory,
  ],
  exports: [
    PostsRepository,
    PostsService,
    TypeOrmModule,
    CoursesClient,
    GroupMessagingClient,
    ModerationClient,
    POST_CREATORS,
    PostCreatorFactory,
  ],
})
export class PostsModule { }
