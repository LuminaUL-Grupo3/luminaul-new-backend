import { Injectable } from '@nestjs/common';
import { DataSource, Repository, IsNull } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { PostEntity } from './entities/post.entity';
import { GroupEntity } from '../groups/entities/group.entity';
import { PostCreateDto } from './dto/post-create.dto';
import { PostUpdateDto } from './dto/post-update.dto';

@Injectable()
export class PostsRepository {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findGroupById(groupId: string): Promise<GroupEntity | null> {
    return this.groupRepo.findOne({
      where: { id: groupId },
    });
  }

  async create(
    postDto: PostCreateDto,
    userId: string,
    courseName: string,
  ): Promise<PostEntity> {
    return this.dataSource.transaction(async (manager) => {
      let finalGroupId: string | null = null;

      if (postDto.group_id) {
        // Caso A: Vincular a grupo existente especificado
        finalGroupId = postDto.group_id;
      } else if (
        postDto.type === 'study_group' ||
        postDto.benefits ||
        postDto.requirements
      ) {
        // Caso B: Auto-creación de grupo cuando es study_group o provee beneficios/requisitos
        const group = manager.create(GroupEntity, {
          id: randomUUID(),
          name: `Grupo de ${courseName}`,
          description: `Grupo de estudio creado automáticamente para coordinar ${courseName}.`,
          benefits: postDto.benefits ?? null,
          requirements: postDto.requirements ?? null,
          adminId: userId,
          createdAt: new Date(),
        });
        const savedGroup = await manager.save(GroupEntity, group);
        finalGroupId = savedGroup.id;
      }
      // Caso C: Tutoría individual o post simple sin grupo -> finalGroupId queda en null

      // Crear la publicación
      const post = manager.create(PostEntity, {
        id: randomUUID(),
        userId,
        courseId: postDto.course_id,
        type: postDto.type,
        description: postDto.description,
        groupId: finalGroupId,
        status: 'published',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return manager.save(PostEntity, post);
    });
  }

  async getPosts(limit: number, offset: number): Promise<PostEntity[]> {
    return this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('author.profile', 'profile')
      .leftJoinAndSelect('post.course', 'course')
      .where('post.deletedAt IS NULL')
      .andWhere('post.status = :status', { status: 'published' })
      .orderBy('post.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();
  }

  async getPostById(postId: string): Promise<PostEntity | null> {
    return this.postRepo.findOne({
      where: {
        id: postId,
        deletedAt: IsNull(),
      },
    });
  }

  async getPostsByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<PostEntity[]> {
    return this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('author.profile', 'profile')
      .leftJoinAndSelect('post.course', 'course')
      .where('post.userId = :userId', { userId })
      .andWhere('post.deletedAt IS NULL')
      .andWhere('post.status = :status', { status: 'published' })
      .orderBy('post.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();
  }

  async searchByFilter(
    limit: number,
    offset: number,
    courseId?: string,
    type?: string,
    cycle?: number,
  ): Promise<PostEntity[]> {
    const qb = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('author.profile', 'profile')
      .leftJoinAndSelect('post.course', 'course')
      .where('post.deletedAt IS NULL')
      .andWhere('post.status = :status', { status: 'published' });

    if (courseId) {
      qb.andWhere('post.courseId = :courseId', { courseId });
    }

    if (type) {
      qb.andWhere('post.type = :type', { type });
    }

    if (cycle !== undefined && cycle !== null) {
      qb.andWhere('course.cycle = :cycle', { cycle });
    }

    return qb
      .orderBy('post.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();
  }

  async edit(
    postId: string,
    postData: PostUpdateDto,
  ): Promise<PostEntity | null> {
    const post = await this.getPostById(postId);
    if (!post) {
      return null;
    }

    if (postData.course_id !== undefined) {
      post.courseId = postData.course_id;
    }
    if (postData.type !== undefined) {
      post.type = postData.type;
    }
    if (postData.description !== undefined) {
      post.description = postData.description;
    }

    return this.postRepo.save(post);
  }

  async delete(postId: string): Promise<boolean> {
    const post = await this.getPostById(postId);
    if (!post) {
      return false;
    }

    // Soft delete idéntico al comportamiento en Python
    post.deletedAt = new Date();
    post.status = 'hidden';
    await this.postRepo.save(post);
    return true;
  }
}
