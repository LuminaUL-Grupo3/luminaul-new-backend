import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  Optional,
  Inject,
} from '@nestjs/common';
import { PostsRepository } from './posts.repository';
import { CoursesRepository } from '../courses/courses.repository';
import { PostCreateDto } from './dto/post-create.dto';
import { PostUpdateDto } from './dto/post-update.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { PostFeedResponseDto } from './dto/post-feed-response.dto';
import { MyPostHistoryResponseDto } from './dto/my-post-history-response.dto';
import { DeletePostResponseDto } from './dto/delete-post-response.dto';
import { PostEntity } from './entities/post.entity';

export interface EventEmitterLike {
  emit(event: string, ...args: unknown[]): boolean;
}

@Injectable()
export class PostsService {
  constructor(
    private readonly postsRepository: PostsRepository,
    private readonly coursesRepository: CoursesRepository,
    @Optional()
    @Inject('EventEmitter')
    private readonly eventEmitter?: EventEmitterLike,
  ) {}

  private mapToPostResponseDto(post: PostEntity): PostResponseDto {
    const profile = post.author?.profile;
    return {
      id: post.id,
      userId: post.userId,
      user_id: post.userId,
      courseId: post.courseId,
      course_id: post.courseId,
      type: post.type,
      description: post.description,
      benefits: post.benefits ?? null,
      requirements: post.requirements ?? null,
      maxCapacity: post.maxCapacity ?? 5,
      max_capacity: post.maxCapacity ?? 5,
      groupId: post.groupId,
      group_id: post.groupId,
      status: post.status,
      createdAt: post.createdAt,
      created_at: post.createdAt,
      updatedAt: post.updatedAt,
      updated_at: post.updatedAt,
      author: {
        id: post.userId,
        user_id: post.userId,
        name: profile?.name ?? '',
        profilePhotoUrl: profile?.profilePhotoUrl ?? null,
        profile_photo_url: profile?.profilePhotoUrl ?? null,
      },
      course: {
        id: post.course?.id ?? post.courseId,
        name: post.course?.name ?? '',
        cycle: post.course?.cycle ?? null,
      },
    };
  }

  mapToFeedDto(post: PostEntity): PostFeedResponseDto {
    const profile = post.author?.profile;
    return {
      id: post.id,
      userId: post.userId,
      user_id: post.userId,
      type: post.type,
      description: post.description,
      benefits: post.benefits ?? null,
      requirements: post.requirements ?? null,
      maxCapacity: post.maxCapacity ?? 5,
      max_capacity: post.maxCapacity ?? 5,
      groupId: post.groupId,
      group_id: post.groupId,
      status: post.status,
      createdAt: post.createdAt,
      created_at: post.createdAt,
      author: {
        id: post.userId,
        user_id: post.userId,
        name: profile?.name ?? '',
        profilePhotoUrl: profile?.profilePhotoUrl ?? null,
        profile_photo_url: profile?.profilePhotoUrl ?? null,
      },
      course: {
        id: post.course?.id ?? post.courseId,
        name: post.course?.name ?? '',
        cycle: post.course?.cycle ?? null,
      },
    };
  }

  private mapToMyPostHistoryDto(post: PostEntity): MyPostHistoryResponseDto {
    return {
      id: post.id,
      type: post.type,
      description: post.description,
      benefits: post.benefits ?? null,
      requirements: post.requirements ?? null,
      maxCapacity: post.maxCapacity ?? 5,
      max_capacity: post.maxCapacity ?? 5,
      groupId: post.groupId,
      group_id: post.groupId,
      status: post.status,
      createdAt: post.createdAt,
      created_at: post.createdAt,
      course: {
        id: post.course?.id ?? post.courseId,
        name: post.course?.name ?? '',
        cycle: post.course?.cycle ?? null,
      },
    };
  }

  // H.U 1.1 (Crear publicación)
  async createPost(
    postDto: PostCreateDto,
    userId: string,
  ): Promise<PostResponseDto> {
    const targetCourseId = PostCreateDto.getCourseId(postDto);
    const course = await this.coursesRepository.findById(targetCourseId);
    if (!course) {
      throw new UnprocessableEntityException('Course not found');
    }

    const targetGroupId = PostCreateDto.getGroupId(postDto);
    if (targetGroupId) {
      const existingGroup = await this.postsRepository.findGroupById(targetGroupId);
      if (!existingGroup) {
        throw new NotFoundException('Specified group not found');
      }
    }

    const createdPost = await this.postsRepository.create(
      postDto,
      userId,
      course.name,
    );

    // Emisión Asíncrona de Moderación (SPEC-06 y AGENTS.md Regla 3.4)
    if (this.eventEmitter) {
      this.eventEmitter.emit('content.created', {
        contentType: 'publication',
        contentId: createdPost.id,
        authorId: createdPost.userId,
        text: `${createdPost.description} ${createdPost.benefits ?? ''} ${createdPost.requirements ?? ''}`.trim(),
      });
    }

    return this.mapToPostResponseDto(createdPost);
  }

  // H.U 1.5 (Feed)
  async listPosts(
    limit: number,
    offset: number,
    search?: string,
  ): Promise<PostFeedResponseDto[]> {
    const { items, total } = await this.postsRepository.getPosts(limit, offset, search);
    const dtos = items.map((p) => this.mapToFeedDto(p));
    return Object.assign(dtos, {
      total,
      limit,
      offset,
      items: dtos,
    });
  }

  // H.U 1.3 (Filtros)
  async filterPosts(
    limit: number,
    offset: number,
    courseId?: string,
    type?: string,
    cycle?: number,
    search?: string,
  ): Promise<PostFeedResponseDto[]> {
    const { items, total } = await this.postsRepository.searchByFilter(
      limit,
      offset,
      courseId,
      type,
      cycle,
      search,
    );
    const dtos = items.map((p) => this.mapToFeedDto(p));
    return Object.assign(dtos, {
      total,
      limit,
      offset,
      items: dtos,
    });
  }

  // H.U 1.6 (Historial propio)
  async listPostsByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<MyPostHistoryResponseDto[]> {
    const { items, total } = await this.postsRepository.getPostsByUser(
      userId,
      limit,
      offset,
    );
    const dtos = items.map((p) => this.mapToMyPostHistoryDto(p));
    return Object.assign(dtos, {
      total,
      limit,
      offset,
      items: dtos,
    });
  }

  // H.U 1.2 (Editar publicación)
  async editPost(
    postId: string,
    payload: PostUpdateDto,
    userId: string,
  ): Promise<PostResponseDto> {
    const existingPost = await this.postsRepository.getPostById(postId);
    if (!existingPost) {
      throw new NotFoundException('Post not found');
    }

    // Validar propiedad
    if (existingPost.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to edit this post',
      );
    }

    const updatedPost = await this.postsRepository.edit(postId, payload);
    if (!updatedPost) {
      throw new NotFoundException('Post not found');
    }

    // Reemisión de evento si se modificó texto
    if (
      this.eventEmitter &&
      (payload.description !== undefined ||
        payload.benefits !== undefined ||
        payload.requirements !== undefined)
    ) {
      this.eventEmitter.emit('content.created', {
        contentType: 'publication',
        contentId: updatedPost.id,
        authorId: updatedPost.userId,
        text: `${updatedPost.description} ${updatedPost.benefits ?? ''} ${updatedPost.requirements ?? ''}`.trim(),
      });
    }

    return this.mapToPostResponseDto(updatedPost);
  }

  // H.U 1.4 (Eliminar publicación)
  async deletePost(
    postId: string,
    userId: string,
  ): Promise<DeletePostResponseDto> {
    const existingPost = await this.postsRepository.getPostById(postId);
    if (!existingPost) {
      throw new NotFoundException('Post not found');
    }

    // Validar propiedad
    if (existingPost.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this post',
      );
    }

    const success = await this.postsRepository.delete(postId);
    if (!success) {
      throw new NotFoundException('Post not found');
    }

    return {
      success: true,
      message: 'Post deleted successfully',
      deletedId: postId,
      publication_id: postId,
      deleted_at: new Date(),
    };
  }
}
