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

@Entity('notifications')
@Index('ix_notifications_user_read', ['userId', 'isRead'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'user_id', nullable: false })
  userId!: string;

  @Column({ type: 'varchar', length: 50, nullable: false })
  type!: string;

  @Column({ type: 'text', nullable: false })
  message!: string;

  @Column({ type: 'boolean', name: 'is_read', default: false, nullable: false })
  isRead!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.notifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;
}
