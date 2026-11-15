import {
  Injectable,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InMemoryTtlCache } from '../../../../common/cache/in-memory-ttl.cache';
import { DOMAIN_EVENTS } from '../../../../common/events/domain-events';
import { UserRole } from '../../../auth-security/enums/UserRole';
import { PostException } from '../../exception/PostException';
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

const POSTS_FEED_CACHE_PREFIX = 'posts:feed:';
const POSTS_FEED_CACHE_TTL_MS = 20_000;
const MAX_CACHED_FEED_LIMIT = 30;

interface CachedFeedPage {
  items: PostFeedResponseDto[];
  total: number;
}

export interface PostFeedCacheFilter {
  courseId?: string;
  type?: string;
  cycle?: number;
  limit: number;
  offset: number;
  search?: string;
}

/**
 * Construye una llave canónica de caché ordenando los filtros presentes por clave
 * para compartir la misma entrada independientemente del orden en la query string.
 */
export function buildPostFeedCacheKey(filters: PostFeedCacheFilter): string {
  const entries: Record<string, string | number> = {
    limit: filters.limit,
    offset: filters.offset,
  };

  if (filters.courseId?.trim()) {
    entries.courseId = filters.courseId.trim();
  }
  if (filters.type?.trim()) {
    entries.type = filters.type.trim();
  }
  if (typeof filters.cycle === 'number' && Number.isFinite(filters.cycle)) {
    entries.cycle = filters.cycle;
  }
  const normalizedSearch = filters.search?.trim().toLowerCase();
  if (normalizedSearch) {
    entries.search = normalizedSearch;
  }

  const serialized = Object.keys(entries)
    .sort()
    .map((key) => `${key}=${entries[key]}`)
    .join('|');

  return `${POSTS_FEED_CACHE_PREFIX}${serialized}`;
}

@Injectable()
export class PostsServiceImpl extends PostsService {
  constructor(
    private readonly postsRepository: PostsRepository,
    private readonly coursesClient: CoursesClient,
    private readonly moderationClient: ModerationClient,
    private readonly postCreatorFactory: PostCreatorFactory,
    @Optional() private readonly groupMessagingClient?: GroupMessagingClient,
    @Optional() private readonly cache?: InMemoryTtlCache,
  ) {
    super();
  }

  private shouldCacheFeedPage(limit: number, offset: number): boolean {
    return (
      limit > 0 &&
      limit <= MAX_CACHED_FEED_LIMIT &&
      offset >= 0 &&
      offset <= limit
    );
  }

  private formatFeedResponse(
    items: PostFeedResponseDto[],
    total: number,
    limit: number,
    offset: number,
  ): PostFeedResponseDto[] {
    const clonedItems = items.map((item) => ({
      ...item,
      author: { ...item.author },
      course: { ...item.course },
    }));
    return Object.assign(clonedItems, {
      total,
      limit,
      offset,
      items: clonedItems,
    });
  }

  private async getFeedPageWithCache(
    cacheKey: string,
    limit: number,
    offset: number,
    loader: () => Promise<CachedFeedPage>,
  ): Promise<PostFeedResponseDto[]> {
    const page =
      this.cache && this.shouldCacheFeedPage(limit, offset)
        ? await this.cache.getOrSet(cacheKey, POSTS_FEED_CACHE_TTL_MS, loader)
        : await loader();

    return this.formatFeedResponse(page.items, page.total, limit, offset);
  }

  private invalidateFeedCache(): void {
    this.cache?.invalidatePrefix(POSTS_FEED_CACHE_PREFIX);
  }

  @OnEvent(DOMAIN_EVENTS.CONTENT_VISIBILITY_CHANGED)
  handleContentVisibilityChanged(payload: { contentType?: string }): void {
    if (payload?.contentType === 'publication') {
      this.invalidateFeedCache();
    }
  }

  private mapToPostResponseDto(post: PostEntity): PostResponseDto {
    const profile = post.profile;
    return {
      id: post.id,
      userId: post.userId,
      courseId: post.courseId,
      type: post.type,
      description: post.description,
      color: post.color ?? 'white',
      benefits: post.benefits ?? null,
      requirements: post.requirements ?? null,
      maxCapacity: post.maxCapacity ?? 5,
      groupId: post.groupId,
      status: post.status,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: {
        id: post.userId,
        name: profile?.name ?? '',
        profilePhotoUrl: profile?.profilePhotoUrl ?? null,
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
      type: post.type,
      description: post.description,
      color: post.color ?? 'white',
      benefits: post.benefits ?? null,
      requirements: post.requirements ?? null,
      maxCapacity: post.maxCapacity ?? 5,
      groupId: post.groupId,
      status: post.status,
      createdAt: post.createdAt,
      author: {
        id: post.userId,
        name: profile?.name ?? '',
        profilePhotoUrl: profile?.profilePhotoUrl ?? null,
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
      type: post.type,
      description: post.description,
      color: post.color ?? 'white',
      benefits: post.benefits ?? null,
      requirements: post.requirements ?? null,
      maxCapacity: post.maxCapacity ?? 5,
      groupId: post.groupId,
      status: post.status,
      createdAt: post.createdAt,
      author: {
        id: post.userId,
        name: profile?.name ?? '',
        profilePhotoUrl: profile?.profilePhotoUrl ?? null,
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
    if (!postDto.description || postDto.description.trim().length === 0) {
      throw new PostException(POST_MESSAGES.EMPTY_DESCRIPTION, HttpStatus.BAD_REQUEST);
    }

    if (
      postDto.maxCapacity !== undefined &&
      (postDto.maxCapacity < 1 || postDto.maxCapacity > 50)
    ) {
      throw new PostException(POST_MESSAGES.INVALID_MAX_CAPACITY, HttpStatus.BAD_REQUEST);
    }

    const course = await this.coursesClient.findById(postDto.courseId);
    if (!course) {
      throw new PostException(POST_MESSAGES.COURSE_NOT_FOUND, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    // 1. Resolver el creador correspondiente según el tipo (Factory Method)
    const creator = this.postCreatorFactory.getCreator(postDto.type);
    const postEntity = await creator.create(postDto, userId, course);

    // 2. Persistir en la base de datos (repositorio puro)
    const createdPost = await this.postsRepository.create(postEntity);
    this.invalidateFeedCache();

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
    const cacheKey = buildPostFeedCacheKey({ limit, offset, search });
    return this.getFeedPageWithCache(cacheKey, limit, offset, async () => {
      const { items, total } = await this.postsRepository.getPosts(limit, offset, search);
      return {
        items: items.map((p) => this.mapToFeedDto(p)),
        total,
      };
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
    const cacheKey = buildPostFeedCacheKey({
      courseId,
      type,
      cycle,
      limit,
      offset,
      search,
    });
    return this.getFeedPageWithCache(cacheKey, limit, offset, async () => {
      const { items, total } = await this.postsRepository.searchByFilter(
        limit,
        offset,
        courseId,
        type,
        cycle,
        search,
      );
      return {
        items: items.map((p) => this.mapToFeedDto(p)),
        total,
      };
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
      throw new PostException(POST_MESSAGES.POST_NOT_FOUND, HttpStatus.NOT_FOUND);
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
      throw new PostException(POST_MESSAGES.POST_NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    // Solo el autor original (no admin) puede editar una publicación; el admin solo puede eliminarla
    if (existingPost.userId !== userId || userRole === UserRole.ADMIN) {
      throw new PostException(POST_MESSAGES.FORBIDDEN_EDIT, HttpStatus.FORBIDDEN);
    }

    // Validar integridad de grupo si se especifica
    if (payload.groupId) {
      const existingGroup = this.groupMessagingClient
        ? await this.groupMessagingClient.findActiveById(payload.groupId)
        : await this.postsRepository.findGroupById(payload.groupId);
      if (!existingGroup) {
        throw new PostException(POST_MESSAGES.GROUP_NOT_FOUND, HttpStatus.NOT_FOUND);
      }
    }

    const updatedPost = await this.postsRepository.edit(postId, payload);
    if (!updatedPost) {
      throw new PostException(POST_MESSAGES.POST_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    this.invalidateFeedCache();

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
      throw new PostException(POST_MESSAGES.POST_NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    // Validar propiedad o rol administrador (SPEC Regla 1)
    if (existingPost.userId !== userId && userRole !== UserRole.ADMIN) {
      throw new PostException(POST_MESSAGES.FORBIDDEN_DELETE, HttpStatus.FORBIDDEN);
    }

    const success = await this.postsRepository.delete(postId);
    if (!success) {
      throw new PostException(POST_MESSAGES.POST_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    this.invalidateFeedCache();

    return {
      success: true,
      message: POST_MESSAGES.DELETED_SUCCESS,
      deletedId: postId,
      deletedAt: new Date(),
    };
  }
}

