import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { PostsService } from '../service/PostsService';
import { PostCreateDto } from '../dto/post-create.dto';
import { PostUpdateDto } from '../dto/post-update.dto';
import { PostFilterQueryDto, PaginationQueryDto } from '../dto/post-query.dto';
import { PostResponseDto } from '../dto/post-response.dto';
import { PostFeedResponseDto } from '../dto/post-feed-response.dto';
import { MyPostHistoryResponseDto } from '../dto/my-post-history-response.dto';
import { DeletePostResponseDto } from '../dto/delete-post-response.dto';
import {
  CreateTutoringRequestDto,
  DecideTutoringRequestDto,
  MyTutoringRequestDto,
  TutoringRequestIncomingDto,
} from '../dto/tutoring-request.dto';
import { CurrentUser, CurrentUserRole } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '../../auth-security/enums/UserRole';

const POST_UUID_PIPE = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException('El identificador debe ser un UUID válido'),
});

@ApiTags('Posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // H.U 1.1: POST /posts (Crear publicación — exclusivo alumnos)
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una nueva publicación (H.U 1.1 / SPEC-03)' })
  @ApiResponse({
    status: 201,
    description: 'Publicación creada exitosamente',
    type: PostResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Falta token de autenticación o es inválido',
  })
  @ApiResponse({
    status: 403,
    description: 'Solo los alumnos pueden crear publicaciones',
  })
  @ApiResponse({
    status: 422,
    description: 'Curso no encontrado o parámetros no válidos',
  })
  async createPost(
    @Body() payload: PostCreateDto,
    @CurrentUser() userId: string,
  ): Promise<PostResponseDto> {
    return this.postsService.createPost(payload, userId);
  }

  // H.U 1.5 y 1.3: GET /posts (Feed y filtros)
  @Get()
  @ApiOperation({
    summary: 'Feed de publicaciones públicas con filtros opcionales (H.U 1.3 / 1.5 / SPEC-03)',
  })
  @ApiResponse({
    status: 200,
    description: 'Feed de publicaciones activas con paginación',
    type: [PostFeedResponseDto],
  })
  async getPosts(
    @Query() query: PostFilterQueryDto,
  ): Promise<PostFeedResponseDto[]> {
    const limit = query.limit ?? 15;
    const offset = query.offset ?? 0;
    const courseId = query.courseId;

    if (
      courseId !== undefined ||
      query.type !== undefined ||
      query.cycle !== undefined ||
      query.search !== undefined
    ) {
      return this.postsService.filterPosts(
        limit,
        offset,
        courseId,
        query.type,
        query.cycle,
        query.search,
      );
    }

    return this.postsService.listPosts(limit, offset, query.search);
  }

  // H.U 1.6: GET /posts/me (Historial propio)
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Historial de publicaciones del usuario autenticado (H.U 1.6 / SPEC-03)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de publicaciones del usuario actual',
    type: [MyPostHistoryResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Falta token de autenticación o es inválido',
  })
  async getMyPosts(
    @Query() query: PaginationQueryDto,
    @CurrentUser() userId: string,
  ): Promise<MyPostHistoryResponseDto[]> {
    const limit = query.limit ?? 15;
    const offset = query.offset ?? 0;

    return this.postsService.listPostsByUser(userId, limit, offset);
  }

  @Get('tutoring-requests/incoming')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Solicitudes de asesoría pendientes recibidas' })
  async getIncomingTutoringRequests(
    @CurrentUser() userId: string,
  ): Promise<TutoringRequestIncomingDto[]> {
    return this.postsService.listIncomingTutoringRequests(userId);
  }

  @Get('tutoring-requests/mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Solicitudes de asesoría enviadas por el usuario' })
  async getMyTutoringRequests(
    @CurrentUser() userId: string,
  ): Promise<MyTutoringRequestDto[]> {
    return this.postsService.listMyTutoringRequests(userId);
  }

  @Post(':postId/tutoring-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enviar solicitud de asesoría 1 a 1' })
  async createTutoringRequest(
    @Param('postId', POST_UUID_PIPE) postId: string,
    @Body() payload: CreateTutoringRequestDto,
    @CurrentUser() userId: string,
  ): Promise<{ id: string; status: string; message: string }> {
    return this.postsService.createTutoringRequest(postId, userId, payload.message);
  }

  @Patch('tutoring-requests/:requestId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Aceptar o rechazar una solicitud de asesoría' })
  async decideTutoringRequest(
    @Param('requestId', POST_UUID_PIPE) requestId: string,
    @Body() payload: DecideTutoringRequestDto,
    @CurrentUser() userId: string,
  ): Promise<{ id: string; status: string; groupId: string | null }> {
    return this.postsService.decideTutoringRequest(requestId, userId, payload.status);
  }

  // H.U 1.2: GET /posts/:postId (Obtener publicación por ID para edición o consulta)
  @Get(':postId')
  @ApiOperation({
    summary: 'Obtener el detalle de una publicación por ID (H.U 1.2 / SPEC-03)',
  })
  @ApiParam({
    name: 'postId',
    type: 'string',
    format: 'uuid',
    description: 'ID de la publicación',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la publicación',
    type: PostResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Publicación no encontrada',
  })
  async getPostById(
    @Param('postId', POST_UUID_PIPE) postId: string,
  ): Promise<PostResponseDto> {
    return this.postsService.getPostById(postId);
  }

  // H.U 1.2: PUT /posts/:postId (Editar publicación)
  @Put(':postId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar una publicación existente (H.U 1.2 / SPEC-03)' })
  @ApiParam({
    name: 'postId',
    type: 'string',
    format: 'uuid',
    description: 'ID de la publicación a editar',
  })
  @ApiResponse({
    status: 200,
    description: 'Publicación editada exitosamente',
    type: PostResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Falta token de autenticación o es inválido',
  })
  @ApiResponse({
    status: 403,
    description: 'No tienes permiso para editar esta publicación',
  })
  @ApiResponse({
    status: 404,
    description: 'Publicación no encontrada',
  })
  async editPost(
    @Param('postId', POST_UUID_PIPE) postId: string,
    @Body() payload: PostUpdateDto,
    @CurrentUser() userId: string,
    @CurrentUserRole() userRole?: string,
  ): Promise<PostResponseDto> {
    return this.postsService.editPost(postId, payload, userId, userRole);
  }

  // H.U 1.4: DELETE /posts/:postId (Eliminar publicación)
  @Delete(':postId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Eliminar una publicación existente (soft delete) (H.U 1.4 / SPEC-03)',
  })
  @ApiParam({
    name: 'postId',
    type: 'string',
    format: 'uuid',
    description: 'ID de la publicación a eliminar',
  })
  @ApiResponse({
    status: 200,
    description: 'Publicación eliminada exitosamente',
    type: DeletePostResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Falta token de autenticación o es inválido',
  })
  @ApiResponse({
    status: 403,
    description: 'No tienes permiso para eliminar esta publicación',
  })
  @ApiResponse({
    status: 404,
    description: 'Publicación no encontrada',
  })
  async deletePost(
    @Param('postId', POST_UUID_PIPE) postId: string,
    @CurrentUser() userId: string,
    @CurrentUserRole() userRole?: string,
  ): Promise<DeletePostResponseDto> {
    return this.postsService.deletePost(postId, userId, userRole);
  }
}

