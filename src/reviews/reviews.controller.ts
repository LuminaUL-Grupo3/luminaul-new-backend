import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, EditReviewDto } from './dto/review.dto';

@ApiTags('Reviews') @ApiBearerAuth() @UseGuards(JwtAuthGuard)
@Controller('profiles')
export class ProfileReviewsController {
  constructor(private readonly service: ReviewsService) {}
  @Get(':id/reviews') received(@Param('id', ParseUUIDPipe) id: string) { return this.service.received(id); }
  @Get(':id/review-eligibility') eligibility(@CurrentUser() author: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.eligibility(author, id); }
}
@ApiTags('Reviews') @ApiBearerAuth() @UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}
  @Get('me') mine(@CurrentUser() author: string) { return this.service.mine(author); }
  @Post() create(@CurrentUser() author: string, @Body() dto: CreateReviewDto) { return this.service.create(author, dto); }
  @Put(':id') update(@CurrentUser() author: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditReviewDto) { return this.service.update(author, id, dto); }
  @Delete(':id') remove(@CurrentUser() author: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.remove(author, id); }
}
