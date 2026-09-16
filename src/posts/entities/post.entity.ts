import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { GroupEntity } from '../../groups/entities/group.entity';
import { CourseEntity } from '../../courses/entities/course.entity';

@Entity('publications')
@Index('idx_posts_feed', ['status', 'deletedAt', 'createdAt'])
export class PostEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index('ix_publications_user_id')
  @Column('uuid', { name: 'user_id', nullable: false })
  userId!: string;

  @Column('uuid', { name: 'group_id', nullable: true })
  groupId!: string | null;

  @Index('ix_publications_course_id')
  @Column('uuid', { name: 'course_id', nullable: false })
  courseId!: string;

  @Column({ type: 'varchar', length: 50, nullable: false })
  type!: string;

  @Column({ type: 'text', nullable: false })
  description!: string;

  @Index('ix_publications_status')
  @Column({ type: 'varchar', length: 50, default: 'published', nullable: false })
  status!: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'deleted_at' })
  deletedAt!: Date | null;

  @ManyToOne(() => UserEntity, (user) => user.posts)
  @JoinColumn({ name: 'user_id' })
  author?: UserEntity;

  @ManyToOne(() => GroupEntity, (group) => group.posts)
  @JoinColumn({ name: 'group_id' })
  group?: GroupEntity | null;

  @ManyToOne(() => CourseEntity, (course) => course.posts)
  @JoinColumn({ name: 'course_id' })
  course?: CourseEntity;
}
