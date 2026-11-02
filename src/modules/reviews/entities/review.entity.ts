import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('reviews')
@Index('ix_reviews_reviewed_user', ['reviewedUserId'])
@Index('ux_reviews_reviewer_reviewed', ['reviewerId', 'reviewedUserId'], { unique: true })
export class ReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'reviewer_id', nullable: false })
  reviewerId!: string;

  @Column('uuid', { name: 'reviewed_user_id', nullable: false })
  reviewedUserId!: string;

  @Column({ type: 'int', nullable: false })
  rating!: number;

  @Column({ type: 'text', nullable: false })
  comment!: string;

  @Column({ type: 'varchar', length: 50, default: 'published', nullable: false })
  status!: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'deleted_at' })
  deletedAt!: Date | null;

  @ManyToOne(() => UserEntity, (user) => user.reviewsGiven, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer?: UserEntity;

  @ManyToOne(() => UserEntity, (user) => user.reviewsReceived, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewed_user_id' })
  reviewedUser?: UserEntity;
}
