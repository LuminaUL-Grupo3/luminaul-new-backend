import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ReviewsService } from '../service/ReviewsService';
import { CreateReviewDto } from '../dto/CreateReviewDto';
import { UpdateReviewDto } from '../dto/UpdateReviewDto';
import { ReviewResponseDto } from '../dto/ReviewResponseDto';
import { UserReviewsSummaryDto } from '../dto/UserReviewsSummaryDto';
import { ReviewEligibilityResponseDto } from '../dto/ReviewEligibilityResponseDto';
import { DeleteReviewResponseDto } from '../dto/DeleteReviewResponseDto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ReviewException } from '../exception/ReviewException';
import { REVIEW_MESSAGES } from '../reviews.constants';

// SPEC-05 pide UUID v4 en los parámetros; el mensaje de error queda en español
const uuidV4 = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new ReviewException(REVIEW_MESSAGES.INVALID_PARAM_ID),
});

// Expone SPEC-05 por HTTP: recibe, valida la forma (DTOs) y delega en ReviewsService
@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // HU 5.1: POST /reviews (Publicar reseña)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Calificar a un compañero de grupo de estudio (HU 5.1)' })
  @ApiResponse({ status: 201, description: 'Reseña publicada', type: ReviewResponseDto })
  @ApiResponse({ status: 400, description: 'Auto-reseña, sin calificación o sin comentario' })
  @ApiResponse({ status: 403, description: 'No estudiaron juntos en un grupo' })
  @ApiResponse({ status: 409, description: 'Ya dejó una reseña para ese usuario' })
  async create(
    @Body() payload: CreateReviewDto,
    @CurrentUser() reviewerId: string,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.create(reviewerId, payload);
  }

  // SPEC-05: GET /reviews/me (Reseñas que escribí)
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reseñas escritas por el usuario autenticado (SPEC-05)' })
  @ApiResponse({ status: 200, type: [ReviewResponseDto] })
  async getMyReviews(@CurrentUser() reviewerId: string): Promise<ReviewResponseDto[]> {
    return this.reviewsService.listMine(reviewerId);
  }

  // HU 5.2: GET /reviews/user/:userId (Ver reseñas en un perfil)
  @Get('user/:userId')
  @ApiOperation({ summary: 'Promedio y reseñas publicadas de un estudiante (HU 5.2)' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: UserReviewsSummaryDto })
  async getUserReviews(
    @Param('userId', uuidV4) userId: string,
  ): Promise<UserReviewsSummaryDto> {
    return this.reviewsService.getUserSummary(userId);
  }

  // HU 5.1: GET /reviews/eligibility/:userId (¿Mostrar "Publicar reseña"?)
  @Get('eligibility/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Indica si el usuario autenticado puede calificar a otro (HU 5.1)' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: ReviewEligibilityResponseDto })
  async checkEligibility(
    @Param('userId', uuidV4) userId: string,
    @CurrentUser() reviewerId: string,
  ): Promise<ReviewEligibilityResponseDto> {
    return this.reviewsService.checkEligibility(reviewerId, userId);
  }

  // HU 5.3: PUT /reviews/:reviewId (Actualizar reseña)
  @Put(':reviewId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar una reseña propia; solo el autor (HU 5.3)' })
  @ApiParam({ name: 'reviewId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Reseña editada', type: ReviewResponseDto })
  @ApiResponse({ status: 403, description: 'No es el autor de la reseña' })
  @ApiResponse({ status: 404, description: 'Reseña no encontrada' })
  async update(
    @Param('reviewId', uuidV4) reviewId: string,
    @Body() payload: UpdateReviewDto,
    @CurrentUser() actorId: string,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.update(reviewId, payload, actorId);
  }

  // HU 5.4: DELETE /reviews/:reviewId (Eliminar reseña, borrado lógico)
  @Delete(':reviewId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar una reseña propia; solo el autor (HU 5.4)' })
  @ApiParam({ name: 'reviewId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Reseña eliminada', type: DeleteReviewResponseDto })
  @ApiResponse({ status: 403, description: 'No es el autor de la reseña' })
  @ApiResponse({ status: 404, description: 'Reseña no encontrada' })
  async remove(
    @Param('reviewId', uuidV4) reviewId: string,
    @CurrentUser() actorId: string,
  ): Promise<DeleteReviewResponseDto> {
    return this.reviewsService.remove(reviewId, actorId);
  }
}
