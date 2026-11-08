import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { getTypeOrmConfig } from './config/database.config';
import { AuthModule } from './modules/auth-security/auth.module';
import { HealthModule } from './health/health.module';
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
      validate: validateEnv,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getTypeOrmConfig,
    }),
    // Límite de tasa para prevenir saturación DoS (300 req/min por IP, compatible con SPA y WebSockets)
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 300,
      },
    ]),
    // Bus de eventos en memoria: content.created (moderación) y notification.send (SPEC-07)
    EventEmitterModule.forRoot(),
    HealthModule,
    AuthModule,
    UserProfileModule,
    CoursesModule,
    PostsModule,
    GroupMessagingModule,
    ReviewsModule,
    ModerationModule,
    AdministrationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
