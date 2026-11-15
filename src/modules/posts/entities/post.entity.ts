import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export interface PostAuthorSnapshot {
  id?: string;
  userId?: string;
  name: string;
  profilePhotoUrl: string | null;
}

export interface PostCourseSnapshot {
  id: string;
  name: string;
  cycle: number | null;
}

@Entity('publications')
@Index('idx_posts_feed', ['status', 'deletedAt', 'createdAt'])
export class PostEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index('ix_publications_user')
  @Column('uuid', { name: 'user_id', nullable: false })
  userId!: string;

  @Column('uuid', { name: 'group_id', nullable: true })
  groupId!: string | null;

  groupCurrentMembers?: number | null;
  groupMaxCapacity?: number | null;

  @Index('ix_publications_course')
  @Column('uuid', { name: 'course_id', nullable: false })
  courseId!: string;

  @Column({ type: 'varchar', length: 50, nullable: false })
  type!: string;

  @Column({ type: 'text', nullable: false })
  description!: string;

  @Column({ type: 'varchar', length: 16, default: 'white' })
  color!: string;

  @Column({ type: 'text', nullable: true })
  benefits!: string | null;

  @Column({ type: 'text', nullable: true })
  requirements!: string | null;

  @Column({ type: 'int', name: 'max_capacity', default: 5, nullable: false })
  maxCapacity!: number;

  @Index('ix_publications_status')
  @Column({ type: 'varchar', length: 50, default: 'published', nullable: false })
  status!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'deleted_at' })
  deletedAt!: Date | null;

  profile?: PostAuthorSnapshot;

  course?: PostCourseSnapshot;
}
