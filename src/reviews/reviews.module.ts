import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewEntity } from './entities/review.entity';
import { AuthModule } from '../auth/auth.module';
import { ProfileReviewsController, ReviewsController } from './reviews.controller';
import { ReviewsRepository } from './reviews.repository';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReviewEntity]), AuthModule],
  controllers: [ProfileReviewsController, ReviewsController],
  providers: [ReviewsRepository, ReviewsService],
  exports: [TypeOrmModule],
})
export class ReviewsModule {}
