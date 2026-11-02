import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { envValidationSchema } from './config/env.validation';
import { getTypeOrmConfig } from './config/database.config';
import { AuthModule } from './modules/auth-security/auth.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './modules/users/users.module';
import { GroupsModule } from './modules/groups/groups.module';
import { CoursesModule } from './modules/courses/courses.module';
import { PostsModule } from './modules/posts/posts.module';
import { GroupMessagingModule } from './modules/group-messaging/group-messaging.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { UserProfileModule } from './modules/user-profile/user-profile.module';
import { AdministrationModule } from './modules/administration/administration.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getTypeOrmConfig,
    }),
    // Bus de eventos en memoria: content.created (moderación) y notification.send (SPEC-07)
    EventEmitterModule.forRoot(),
    HealthModule,
    AuthModule,
    UsersModule,
    UserProfileModule,
    GroupsModule,
    CoursesModule,
    PostsModule,
    GroupMessagingModule,
    ReviewsModule,
    ModerationModule,
    AdministrationModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}

