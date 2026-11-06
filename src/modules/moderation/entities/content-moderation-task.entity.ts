import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TargetContentType, TaskStatus } from '../enums/moderation.enums';

@Entity('moderation_tasks')
@Index('ix_moderation_tasks_claim', ['status', 'availableAt'])
@Index('uq_moderation_tasks_content', ['contentType', 'contentId', 'contentVersion'], { unique: true })
export class ContentModerationTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20, name: 'content_type' })
  contentType!: TargetContentType;

  @Column('uuid', { name: 'content_id' })
  contentId!: string;

  @Column({ type: 'int', default: 1, name: 'content_version' })
  contentVersion!: number;

  @Column({ type: 'varchar', length: 20, default: TaskStatus.PENDING })
  status!: TaskStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'int', default: 3, name: 'max_attempts' })
  maxAttempts!: number;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP', name: 'available_at' })
  availableAt!: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'locked_at' })
  lockedAt!: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'locked_by' })
  lockedBy!: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'lock_token' })
  lockToken!: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'lease_expires_at' })
  leaseExpiresAt!: Date | null;

  @Column({ type: 'text', nullable: true, name: 'last_error' })
  lastError!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'completed_at' })
  completedAt!: Date | null;
}
