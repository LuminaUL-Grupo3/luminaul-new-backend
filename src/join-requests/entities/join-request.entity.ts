import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { GroupEntity } from '../../groups/entities/group.entity';
import { UserEntity } from '../../users/entities/user.entity';

export type JoinRequestStatus = 'pending' | 'accepted' | 'rejected';

@Entity('join_requests')
@Index('idx_join_requests_group_status', ['groupId', 'status'])
@Index('idx_join_requests_requester', ['requesterId', 'status'])
export class JoinRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'group_id', nullable: false })
  groupId!: string;

  @Column('uuid', { name: 'requester_id', nullable: false })
  requesterId!: string;

  @Column({ type: 'varchar', length: 50, default: 'pending', nullable: false })
  status!: JoinRequestStatus;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'reviewed_at' })
  reviewedAt!: Date | null;

  @Column('uuid', { name: 'reviewed_by', nullable: true })
  reviewedById!: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'responded_at' })
  respondedAt!: Date | null;

  @ManyToOne(() => GroupEntity, (group) => group.joinRequests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group?: GroupEntity;

  @ManyToOne(() => UserEntity, (user) => user.joinRequests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester?: UserEntity;

  @ManyToOne(() => UserEntity, (user) => user.reviewedJoinRequests, { nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer?: UserEntity | null;
}
