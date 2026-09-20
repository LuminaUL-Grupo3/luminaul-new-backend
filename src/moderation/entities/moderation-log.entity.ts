import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { PostEntity } from '../../posts/entities/post.entity';
import { GroupMessageEntity } from '../../groups/entities/group-message.entity';
import { ReviewEntity } from '../../reviews/entities/review.entity';
import { AppealEntity } from './appeal.entity';

@Entity('moderation_log')
export class ModerationLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'publication_id', nullable: true })
  publicationId!: string | null;

  @Column('uuid', { name: 'message_id', nullable: true })
  messageId!: string | null;

  @Column('uuid', { name: 'review_id', nullable: true })
  reviewId!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: false })
  result!: string;

  @CreateDateColumn({ type: 'timestamp', name: 'moderated_at', default: () => 'CURRENT_TIMESTAMP' })
  moderatedAt!: Date;

  @ManyToOne(() => PostEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'publication_id' })
  publication?: PostEntity | null;

  @ManyToOne(() => GroupMessageEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'message_id' })
  message?: GroupMessageEntity | null;

  @ManyToOne(() => ReviewEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'review_id' })
  review?: ReviewEntity | null;

  @OneToMany(() => AppealEntity, (appeal) => appeal.moderationLog)
  appeals?: AppealEntity[];
}
