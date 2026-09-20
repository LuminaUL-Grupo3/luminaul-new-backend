import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { PostEntity } from '../../posts/entities/post.entity';
import { GroupMessageEntity } from '../../groups/entities/group-message.entity';
import { ReviewEntity } from '../../reviews/entities/review.entity';

@Entity('reports')
@Index('ix_reports_status', ['status'])
export class ReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'reporter_id', nullable: false })
  reporterId!: string;

  @Column('uuid', { name: 'publication_id', nullable: true })
  publicationId!: string | null;

  @Column('uuid', { name: 'message_id', nullable: true })
  messageId!: string | null;

  @Column('uuid', { name: 'review_id', nullable: true })
  reviewId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: false })
  reason!: string;

  @Column({ type: 'varchar', length: 50, default: 'pending', nullable: false })
  status!: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.reportsFiled, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter?: UserEntity;

  @ManyToOne(() => PostEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'publication_id' })
  publication?: PostEntity | null;

  @ManyToOne(() => GroupMessageEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'message_id' })
  message?: GroupMessageEntity | null;

  @ManyToOne(() => ReviewEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'review_id' })
  review?: ReviewEntity | null;
}
