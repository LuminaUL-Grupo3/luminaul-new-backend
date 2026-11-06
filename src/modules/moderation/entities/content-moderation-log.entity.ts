import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
  LexicalResult,
  ModerationDecision,
  ModerationResult,
  SemanticStatus,
  TargetContentType,
} from '../enums/moderation.enums';

@Entity('moderation_logs')
@Index('ix_moderation_logs_author', ['authorId'])
@Index('uq_moderation_logs_task', ['moderationTaskId'], { unique: true })
export class ContentModerationLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true, name: 'moderation_task_id' })
  moderationTaskId!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'content_type' })
  contentType!: TargetContentType;

  @Column('uuid', { name: 'content_id' })
  contentId!: string;

  @Column('uuid', { name: 'author_id' })
  authorId!: string;

  @Column('text', { array: true, name: 'detected_words' })
  detectedWords!: string[];

  @Column({ type: 'varchar', length: 20, default: ModerationResult.BLOCKED })
  result!: ModerationResult;

  @Column({ type: 'varchar', length: 20, default: LexicalResult.NOT_EVALUATED, name: 'lexical_result' })
  lexicalResult!: LexicalResult;

  @Column({ type: 'varchar', length: 30, default: SemanticStatus.NOT_EVALUATED, name: 'semantic_status' })
  semanticStatus!: SemanticStatus;

  @Column({ type: 'varchar', length: 20, default: ModerationDecision.PENDING_REVIEW, name: 'moderation_decision' })
  moderationDecision!: ModerationDecision;

  @CreateDateColumn({ type: 'timestamptz', name: 'moderated_at' })
  moderatedAt!: Date;
}
