import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ModerationLogEntity } from './moderation-log.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('appeals')
export class AppealEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'moderation_log_id', nullable: false })
  moderationLogId!: string;

  @Column('uuid', { name: 'user_id', nullable: false })
  userId!: string;

  @Column({ type: 'text', nullable: false })
  justification!: string;

  @Column({ type: 'varchar', length: 50, default: 'pending', nullable: false })
  status!: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @ManyToOne(() => ModerationLogEntity, (log) => log.appeals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'moderation_log_id' })
  moderationLog?: ModerationLogEntity;

  @ManyToOne(() => UserEntity, (user) => user.appeals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;
}
