import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { GroupEntity } from './group.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('group_messages')
@Index('ix_group_messages_group_date', ['groupId', 'createdAt'])
export class GroupMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'group_id', nullable: false })
  groupId!: string;

  @Column('uuid', { name: 'sender_id', nullable: false })
  senderId!: string;

  @Column({ type: 'text', nullable: false })
  content!: string;

  @Column({ type: 'varchar', length: 50, default: 'published', nullable: false })
  status!: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @ManyToOne(() => GroupEntity, (group) => group.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group?: GroupEntity;

  @ManyToOne(() => UserEntity, (user) => user.sentMessages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender?: UserEntity;
}
