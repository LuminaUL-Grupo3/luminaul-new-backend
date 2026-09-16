import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { PostCreateDto } from './dto/post-create.dto';
import { PostUpdateDto } from './dto/post-update.dto';
import { PostFilterQueryDto, PaginationQueryDto } from './dto/post-query.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { PostFeedResponseDto } from './dto/post-feed-response.dto';
import { MyPostHistoryResponseDto } from './dto/my-post-history-response.dto';
import { DeletePostResponseDto } from './dto/delete-post-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // H.U 1.1: POST /posts (Crear publicación)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una nueva publicación (H.U 1.1)' })
  @ApiResponse({
    status: 201,
    description: 'Publicación creada exitosamente',
    type: PostResponseDto,
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
  @ApiOperation({ summary: 'Feed de publicaciones públicas con filtros opcionales (H.U 1.3 / 1.5)' })
  @ApiResponse({
    status: 200,
    description: 'Lista de publicaciones del feed',
    type: [PostFeedResponseDto],
  })
  async listPosts(
    @Query() query: PostFilterQueryDto,
  ): Promise<PostFeedResponseDto[]> {
    const limit = query.limit ?? 15;
    const offset = query.offset ?? 0;

    if (
      query.course_id !== undefined ||
      query.type !== undefined ||
      query.cycle !== undefined
    ) {
      return this.postsService.filterPosts(
        limit,
        offset,
        query.course_id,
        query.type,
        query.cycle,
      );
    }

    return this.postsService.listPosts(limit, offset);
  }

  // H.U 1.6: GET /posts/me (Historial propio)
  @Get('me')
  @ApiOperation({ summary: 'Historial de publicaciones del usuario autenticado (H.U 1.6)' })
  @ApiResponse({
    status: 200,
    description: 'Lista de publicaciones del usuario actual',
    type: [MyPostHistoryResponseDto],
  })
  async getMyPosts(
    @Query() query: PaginationQueryDto,
    @CurrentUser() userId: string,
  ): Promise<MyPostHistoryResponseDto[]> {
    const limit = query.limit ?? 15;
    const offset = query.offset ?? 0;

    return this.postsService.listPostsByUser(
      userId,
      limit,
      offset,
    );
  }

  // H.U 1.2: PUT /posts/:post_id (Editar publicación)
  @Put(':post_id')
  @ApiOperation({ summary: 'Editar una publicación existente (H.U 1.2)' })
  @ApiParam({
    name: 'post_id',
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
    status: 403,
    description: 'No tienes permiso para editar esta publicación',
  })
  @ApiResponse({
    status: 404,
    description: 'Publicación no encontrada',
  })
  async editPost(
    @Param('post_id', ParseUUIDPipe) postId: string,
    @Body() payload: PostUpdateDto,
    @CurrentUser() userId: string,
  ): Promise<PostResponseDto> {
    return this.postsService.editPost(postId, payload, userId);
  }

  // H.U 1.4: DELETE /posts/:post_id (Eliminar publicación)
  @Delete(':post_id')
  @ApiOperation({ summary: 'Eliminar una publicación existente (soft delete) (H.U 1.4)' })
  @ApiParam({
    name: 'post_id',
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
    status: 403,
    description: 'No tienes permiso para eliminar esta publicación',
  })
  @ApiResponse({
    status: 404,
    description: 'Publicación no encontrada',
  })
  async deletePost(
    @Param('post_id', ParseUUIDPipe) postId: string,
    @CurrentUser() userId: string,
  ): Promise<DeletePostResponseDto> {
    return this.postsService.deletePost(postId, userId);
  }
}
