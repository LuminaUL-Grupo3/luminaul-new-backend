import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  Optional,
} from '@nestjs/common';
import { PostsService } from '../PostsService';
import { PostsRepository } from '../../repository/PostsRepository';
import { CoursesClient } from '../../client/CoursesClient';
import { GroupMessagingClient } from '../../client/GroupMessagingClient';
import { ModerationClient } from '../../client/ModerationClient';
import { PostCreatorFactory } from '../../factory/PostCreatorFactory';
import { PostCreateDto } from '../../dto/post-create.dto';
import { PostUpdateDto } from '../../dto/post-update.dto';
import { PostResponseDto } from '../../dto/post-response.dto';
import { PostFeedResponseDto } from '../../dto/post-feed-response.dto';
import { MyPostHistoryResponseDto } from '../../dto/my-post-history-response.dto';
import { DeletePostResponseDto } from '../../dto/delete-post-response.dto';
import { PostEntity } from '../../entities/post.entity';
import { POST_MESSAGES } from '../../posts.constants';

@Injectable()
export class PostsServiceImpl extends PostsService {
  constructor(
    private readonly postsRepository: PostsRepository,
    private readonly coursesClient: CoursesClient,
    private readonly moderationClient: ModerationClient,
    private readonly postCreatorFactory: PostCreatorFactory,
    @Optional() private readonly groupMessagingClient?: GroupMessagingClient,
  ) {
    super();
  }

  private mapToPostResponseDto(post: PostEntity): PostResponseDto {
    const profile = post.profile;
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
    const profile = post.profile;
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
    const profile = post.profile;
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

  // H.U 1.1 (Crear publicación usando Factory Method y Adapter)
  async createPost(
    postDto: PostCreateDto,
    userId: string,
  ): Promise<PostResponseDto> {
    const course = await this.coursesClient.findById(postDto.courseId);
    if (!course) {
      throw new UnprocessableEntityException(POST_MESSAGES.COURSE_NOT_FOUND);
    }

    // 1. Resolver el creador correspondiente según el tipo (Factory Method)
    const creator = this.postCreatorFactory.getCreator(postDto.type);
    const postEntity = await creator.create(postDto, userId, course);

    // 2. Persistir en la base de datos (repositorio puro)
    const createdPost = await this.postsRepository.create(postEntity);

    // 3. Notificar al motor de moderación asíncrona (Adapter)
    this.moderationClient.publicationCreated(createdPost);

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

  // H.U 1.2 (Obtener publicación por ID para edición o consulta)
  async getPostById(postId: string): Promise<PostResponseDto> {
    const post = await this.postsRepository.getPostById(postId);
    if (!post) {
      throw new NotFoundException(POST_MESSAGES.POST_NOT_FOUND);
    }
    return this.mapToPostResponseDto(post);
  }

  // H.U 1.2 (Editar publicación)
  async editPost(
    postId: string,
    payload: PostUpdateDto,
    userId: string,
    userRole?: string,
  ): Promise<PostResponseDto> {
    const existingPost = await this.postsRepository.getPostById(postId);
    if (!existingPost) {
      throw new NotFoundException(POST_MESSAGES.POST_NOT_FOUND);
    }

    // Validar propiedad o rol administrador (SPEC Regla 1)
    if (existingPost.userId !== userId && userRole !== 'admin') {
      throw new ForbiddenException(POST_MESSAGES.FORBIDDEN_EDIT);
    }

    // Validar integridad de grupo si se especifica
    if (payload.groupId) {
      const existingGroup = this.groupMessagingClient
        ? await this.groupMessagingClient.findActiveById(payload.groupId)
        : await this.postsRepository.findGroupById(payload.groupId);
      if (!existingGroup) {
        throw new NotFoundException(POST_MESSAGES.GROUP_NOT_FOUND);
      }
    }

    const updatedPost = await this.postsRepository.edit(postId, payload);
    if (!updatedPost) {
      throw new NotFoundException(POST_MESSAGES.POST_NOT_FOUND);
    }

    // Reemisión de evento si se modificó texto (Adapter)
    if (
      payload.description !== undefined ||
      payload.benefits !== undefined ||
      payload.requirements !== undefined
    ) {
      this.moderationClient.publicationCreated(updatedPost);
    }

    return this.mapToPostResponseDto(updatedPost);
  }

  // H.U 1.4 (Eliminar publicación)
  async deletePost(
    postId: string,
    userId: string,
    userRole?: string,
  ): Promise<DeletePostResponseDto> {
    const existingPost = await this.postsRepository.getPostById(postId);
    if (!existingPost) {
      throw new NotFoundException(POST_MESSAGES.POST_NOT_FOUND);
    }

    // Validar propiedad o rol administrador (SPEC Regla 1)
    if (existingPost.userId !== userId && userRole !== 'admin') {
      throw new ForbiddenException(POST_MESSAGES.FORBIDDEN_DELETE);
    }

    const success = await this.postsRepository.delete(postId);
    if (!success) {
      throw new NotFoundException(POST_MESSAGES.POST_NOT_FOUND);
    }

    return {
      success: true,
      message: POST_MESSAGES.DELETED_SUCCESS,
      deletedId: postId,
      publication_id: postId,
      deleted_at: new Date(),
    };
  }
}

