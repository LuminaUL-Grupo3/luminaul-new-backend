import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { GroupEntity } from './group.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('group_members')
@Index('idx_group_members_group_user', ['groupId', 'userId'])
export class GroupMemberEntity {
  @PrimaryColumn('uuid', { name: 'group_id' })
  groupId!: string;

  @PrimaryColumn('uuid', { name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 50, default: 'member', nullable: false })
  role!: string;

  @CreateDateColumn({ type: 'timestamp', name: 'joined_at', default: () => 'CURRENT_TIMESTAMP' })
  joinedAt!: Date;

  @ManyToOne(() => GroupEntity, (group) => group.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group?: GroupEntity;

  @ManyToOne(() => UserEntity, (user) => user.groupMemberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;
}
