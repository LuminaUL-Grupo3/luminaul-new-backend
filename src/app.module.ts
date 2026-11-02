import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envValidationSchema } from './config/env.validation';
import { getTypeOrmConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { CoursesModule } from './courses/courses.module';
import { PostsModule } from './posts/posts.module';
import { GroupMessagingModule } from './modules/group-messaging/group-messaging.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ModerationModule } from './moderation/moderation.module';
import { UserProfileModule } from './modules/user-profile/user-profile.module';
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
    HealthModule,
    AuthModule,
    UsersModule,
    UserProfileModule,
    GroupsModule,
    CoursesModule,
    PostsModule,
    GroupMessagingModule,
    NotificationsModule,
    ReviewsModule,
    ModerationModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}

