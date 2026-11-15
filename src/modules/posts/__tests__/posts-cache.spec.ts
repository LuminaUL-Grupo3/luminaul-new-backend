import { type Mocked } from 'vitest';
import { InMemoryTtlCache } from '../../../common/cache/in-memory-ttl.cache';
import { CoursesClient } from '../client/CoursesClient';
import { GroupMessagingClient } from '../client/GroupMessagingClient';
import { ModerationClient } from '../client/ModerationClient';
import { PostEntity } from '../entities/post.entity';
import { PostCreatorFactory } from '../factory/PostCreatorFactory';
import { PostCreator } from '../factory/PostCreator';
import { StudyGroupPostCreator } from '../factory/impl/StudyGroupPostCreator';
import { TutoringPostCreator } from '../factory/impl/TutoringPostCreator';
import { POST_TYPES } from '../posts.constants';
import { PostsRepository } from '../repository/PostsRepository';
import {
  buildPostFeedCacheKey,
  PostsServiceImpl,
} from '../service/impl/PostsServiceImpl';

function createSamplePost(id = 'post-1'): PostEntity {
  const now = new Date('2026-11-14T10:00:00Z');
  return {
    id,
    userId: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    courseId: '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
    type: POST_TYPES.STUDY_GROUP,
    description: 'Grupo para repasar arquitectura y patrones.',
    color: 'white',
    benefits: 'Apuntes compartidos',
    requirements: 'Haber revisado el tema 3',
    maxCapacity: 5,
    groupId: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    profile: {
      id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
      name: 'Martín Vizcarra',
      profilePhotoUrl: null,
    },
    course: {
      id: '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
      name: 'Ingeniería de Software I',
      cycle: 5,
    },
  } as unknown as PostEntity;
}

describe('PostsServiceImpl feed caching (Parte B)', () => {
  let mockRepo: Mocked<PostsRepository>;
  let mockCoursesClient: Mocked<CoursesClient>;
  let mockModerationClient: Mocked<ModerationClient>;
  let mockGroupMessagingClient: Mocked<GroupMessagingClient>;
  let cache: InMemoryTtlCache;
  let service: PostsServiceImpl;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));

    mockRepo = {
      create: vi.fn(),
      getPosts: vi.fn(),
      searchByFilter: vi.fn(),
      getPostsByUser: vi.fn(),
      getPostById: vi.fn(),
      edit: vi.fn(),
      delete: vi.fn(),
      findCourseById: vi.fn(),
      findGroupById: vi.fn(),
    } as unknown as Mocked<PostsRepository>;

    mockCoursesClient = {
      findById: vi.fn().mockResolvedValue({
        id: '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
        name: 'Ingeniería de Software I',
        cycle: 5,
      }),
    };

    mockModerationClient = {
      publicationCreated: vi.fn(),
    };

    mockGroupMessagingClient = {
      findActiveById: vi.fn(),
      createAutoGroup: vi.fn().mockResolvedValue('7b134111-9a22-48df-9fa0-cd8213aa0981'),
    } as unknown as Mocked<GroupMessagingClient>;

    const creators: PostCreator[] = [
      new StudyGroupPostCreator(mockGroupMessagingClient),
      new TutoringPostCreator(),
    ];
    const factory = new PostCreatorFactory(creators);
    cache = new InMemoryTtlCache();

    service = new PostsServiceImpl(
      mockRepo,
      mockCoursesClient,
      mockModerationClient,
      factory,
      mockGroupMessagingClient,
      cache,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('produces identical canonical cache keys regardless of filter insertion order and normalizes search', () => {
    const keyA = buildPostFeedCacheKey({
      limit: 10,
      offset: 0,
      courseId: '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
      type: 'TUTORING',
      search: '  Cálculo  ',
    });

    const keyB = buildPostFeedCacheKey({
      search: 'cálculo',
      type: 'TUTORING',
      courseId: '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
      offset: 0,
      limit: 10,
    });

    expect(keyA).toBe(keyB);
    expect(keyA).toBe(
      'posts:feed:courseId=8c537243-ea7d-411a-8bb7-fce5230bfdf2|limit=10|offset=0|search=cálculo|type=TUTORING',
    );
  });

  it('caches first pages of listPosts and filterPosts, clones returned items, and skips deep offsets', async () => {
    const sample = createSamplePost();
    mockRepo.getPosts.mockResolvedValue({ items: [sample], total: 1 });
    mockRepo.searchByFilter.mockResolvedValue({ items: [sample], total: 1 });

    const feed1 = await service.listPosts(15, 0);
    feed1[0].description = 'Mutated description';

    const feed2 = await service.listPosts(15, 0);
    expect(mockRepo.getPosts).toHaveBeenCalledTimes(1);
    expect(feed2[0].description).toBe(sample.description);

    await service.filterPosts(
      15,
      0,
      '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
      POST_TYPES.STUDY_GROUP,
    );
    await service.filterPosts(
      15,
      0,
      '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
      POST_TYPES.STUDY_GROUP,
    );
    expect(mockRepo.searchByFilter).toHaveBeenCalledTimes(1);

    // Deep page (offset > limit) bypasses cache
    await service.listPosts(15, 30);
    await service.listPosts(15, 30);
    expect(mockRepo.getPosts).toHaveBeenCalledTimes(3);
  });

  it('invalidates feed cache on createPost, editPost, deletePost, and content.visibility_changed events', async () => {
    const sample = createSamplePost();
    mockRepo.getPosts.mockResolvedValue({ items: [sample], total: 1 });
    mockRepo.create.mockResolvedValue(sample);
    mockRepo.getPostById.mockResolvedValue(sample);
    mockRepo.edit.mockResolvedValue(sample);
    mockRepo.delete.mockResolvedValue(true);

    // 1. Warm cache then createPost invalidates
    await service.listPosts(15, 0);
    await service.createPost(
      {
        courseId: sample.courseId,
        type: POST_TYPES.STUDY_GROUP,
        description: 'Nuevo post válido para el grupo.',
      },
      sample.userId,
    );
    await service.listPosts(15, 0);
    expect(mockRepo.getPosts).toHaveBeenCalledTimes(2);

    // 2. editPost invalidates
    await service.editPost(
      sample.id,
      { description: 'Descripción actualizada' },
      sample.userId,
    );
    await service.listPosts(15, 0);
    expect(mockRepo.getPosts).toHaveBeenCalledTimes(3);

    // 3. deletePost invalidates
    await service.deletePost(sample.id, sample.userId);
    await service.listPosts(15, 0);
    expect(mockRepo.getPosts).toHaveBeenCalledTimes(4);

    // 4. content.visibility_changed for publication invalidates, ignores other content types
    service.handleContentVisibilityChanged({ contentType: 'message' });
    await service.listPosts(15, 0);
    expect(mockRepo.getPosts).toHaveBeenCalledTimes(4);

    service.handleContentVisibilityChanged({ contentType: 'publication' });
    await service.listPosts(15, 0);
    expect(mockRepo.getPosts).toHaveBeenCalledTimes(5);
  });
});
