import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
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

@Injectable()
export class PostsService {
  constructor(
    private readonly postsRepository: PostsRepository,
    private readonly coursesRepository: CoursesRepository,
  ) {}

  private mapToPostResponseDto(post: PostEntity): PostResponseDto {
    return {
      id: post.id,
      user_id: post.userId,
      course_id: post.courseId,
      type: post.type,
      description: post.description,
      group_id: post.groupId,
      status: post.status,
      created_at: post.createdAt,
      updated_at: post.updatedAt,
    };
  }

  mapToFeedDto(post: PostEntity): PostFeedResponseDto {
    const profile = post.author?.profile;
    return {
      id: post.id,
      type: post.type,
      description: post.description,
      group_id: post.groupId,
      status: post.status,
      created_at: post.createdAt,
      author: {
        user_id: post.userId,
        name: profile?.name ?? '',
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
      group_id: post.groupId,
      status: post.status,
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
    const course = await this.coursesRepository.findById(postDto.course_id);
    if (!course) {
      throw new UnprocessableEntityException('Course not found');
    }

    if (postDto.group_id) {
      const existingGroup = await this.postsRepository.findGroupById(postDto.group_id);
      if (!existingGroup) {
        throw new NotFoundException('Specified group not found');
      }
    }

    const createdPost = await this.postsRepository.create(
      postDto,
      userId,
      course.name,
    );
    return this.mapToPostResponseDto(createdPost);
  }

  // H.U 1.5 (Feed)
  async listPosts(limit: number, offset: number): Promise<PostFeedResponseDto[]> {
    const posts = await this.postsRepository.getPosts(limit, offset);
    return posts.map((p) => this.mapToFeedDto(p));
  }

  // H.U 1.3 (Filtros)
  async filterPosts(
    limit: number,
    offset: number,
    courseId?: string,
    type?: string,
    cycle?: number,
  ): Promise<PostFeedResponseDto[]> {
    const posts = await this.postsRepository.searchByFilter(
      limit,
      offset,
      courseId,
      type,
      cycle,
    );
    return posts.map((p) => this.mapToFeedDto(p));
  }

  // H.U 1.6 (Historial propio)
  async listPostsByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<MyPostHistoryResponseDto[]> {
    const posts = await this.postsRepository.getPostsByUser(
      userId,
      limit,
      offset,
    );
    return posts.map((p) => this.mapToMyPostHistoryDto(p));
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
      publication_id: postId,
      deleted_at: new Date(),
    };
  }
}
