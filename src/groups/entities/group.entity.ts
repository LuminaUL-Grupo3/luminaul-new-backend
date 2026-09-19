import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { PostEntity } from '../../posts/entities/post.entity';
import { GroupMemberEntity } from './group-member.entity';
import { JoinRequestEntity } from '../../join-requests/entities/join-request.entity';
import { GroupMessageEntity } from './group-message.entity';

@Entity('groups')
export class GroupEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  benefits!: string | null;

  @Column({ type: 'text', nullable: true })
  requirements!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'meeting_mode' })
  meetingMode!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'meeting_shift' })
  meetingShift!: string | null;

  @Column({ type: 'int', nullable: true, name: 'max_capacity' })
  maxCapacity!: number | null;

  @Column('uuid', { name: 'admin_id', nullable: false })
  adminId!: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'deleted_at' })
  deletedAt!: Date | null;

  @ManyToOne(() => UserEntity, (user) => user.administeredGroups)
  @JoinColumn({ name: 'admin_id' })
  admin?: UserEntity;

  @OneToMany(() => PostEntity, (post) => post.group)
  posts?: PostEntity[];

  @OneToMany(() => GroupMemberEntity, (member) => member.group)
  members?: GroupMemberEntity[];

  @OneToMany(() => JoinRequestEntity, (request) => request.group)
  joinRequests?: JoinRequestEntity[];

  @OneToMany(() => GroupMessageEntity, (message) => message.group)
  messages?: GroupMessageEntity[];
}
