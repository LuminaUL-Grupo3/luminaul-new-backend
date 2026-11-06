import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AppealStatus } from '../enums/moderation.enums';

// Apelación del autor sobre una moderación automática. La resuelve el administrador (SPEC-07).
@Entity('appeals')
@Index('uq_appeals_one_per_log', ['moderationLogId'], { unique: true })
export class ContentAppealEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'moderation_log_id' })
  moderationLogId!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('text')
  justification!: string;

  @Column({ type: 'varchar', length: 20, default: AppealStatus.PENDING })
  status!: AppealStatus;

  @Column('uuid', { name: 'resolved_by', nullable: true })
  resolvedBy!: string | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
