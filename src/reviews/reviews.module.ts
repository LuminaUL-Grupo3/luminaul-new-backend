import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewEntity } from './entities/review.entity';
import { AuthModule } from '../auth/auth.module';
import { ReviewsController } from './controller/ReviewsController';
import { ReviewsService } from './service/ReviewsService';
import { ReviewsServiceImpl } from './service/impl/ReviewsServiceImpl';
import { ReviewsRepository } from './repository/ReviewsRepository';
import { ReviewsRepositoryImpl } from './repository/impl/ReviewsRepositoryImpl';
import { GroupMembershipClient } from './client/GroupMembershipClient';
import { GroupMembershipClientImpl } from './client/impl/GroupMembershipClientImpl';
import { ModerationClient } from './client/ModerationClient';
import { ModerationClientImpl } from './client/impl/ModerationClientImpl';
import { ProfileClient } from './client/ProfileClient';
import { ProfileClientImpl } from './client/impl/ProfileClientImpl';
import { ReviewEligibilityStrategy } from './strategy/ReviewEligibilityStrategy';
import { NoSelfReviewRule } from './strategy/impl/NoSelfReviewRule';
import { SharedGroupRule } from './strategy/impl/SharedGroupRule';
import { UniqueReviewRule } from './strategy/impl/UniqueReviewRule';
import { REVIEW_ELIGIBILITY_RULES } from './reviews.constants';

@Module({
  // AuthModule aporta lo que necesita JwtAuthGuard
  imports: [TypeOrmModule.forFeature([ReviewEntity]), AuthModule],
  controllers: [ReviewsController],
  // Inversión de dependencias: cada abstracción recibe aquí su implementación.
  // Singleton: NestJS crea una sola instancia de cada provider y la comparte (scope por defecto).
  providers: [
    { provide: ReviewsService, useClass: ReviewsServiceImpl },
    { provide: ReviewsRepository, useClass: ReviewsRepositoryImpl },
    { provide: GroupMembershipClient, useClass: GroupMembershipClientImpl },
    { provide: ModerationClient, useClass: ModerationClientImpl },
    { provide: ProfileClient, useClass: ProfileClientImpl },
    NoSelfReviewRule,
    SharedGroupRule,
    UniqueReviewRule,
    // Factory provider: arma la lista de estrategias en el orden de SPEC-05:
    // auto-reseña (400) -> grupo compartido (403) -> reseña única (409)
    {
      provide: REVIEW_ELIGIBILITY_RULES,
      useFactory: (...rules: ReviewEligibilityStrategy[]) => rules,
      inject: [NoSelfReviewRule, SharedGroupRule, UniqueReviewRule],
    },
  ],
  // ReviewsRepository queda disponible para moderación (SPEC-06) y administración (SPEC-07)
  exports: [TypeOrmModule, ReviewsRepository],
})
export class ReviewsModule {}
