import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { ProfileEntity } from './profile.entity';
import { PostEntity } from '../../posts/entities/post.entity';
import { GroupEntity } from '../../groups/entities/group.entity';
import { GroupMemberEntity } from '../../groups/entities/group-member.entity';
import { JoinRequestEntity } from '../../join-requests/entities/join-request.entity';
import { AvailabilityEntity } from './availability.entity';
import { ReviewEntity } from '../../reviews/entities/review.entity';
import { NotificationEntity } from '../../notifications/entities/notification.entity';
import { GroupMessageEntity } from '../../groups/entities/group-message.entity';
import { ReportEntity } from '../../moderation/entities/report.entity';
import { AppealEntity } from '../../moderation/entities/appeal.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('ix_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true, nullable: false })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: false, name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 50, default: 'student', nullable: false })
  role!: string;

  @Index('ix_users_status')
  @Column({ type: 'varchar', length: 50, default: 'pending_verification', nullable: false })
  status!: string;

  @Column({ type: 'boolean', default: false, name: 'is_verified', nullable: false })
  isVerified!: boolean;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true, name: 'verification_token' })
  verificationToken!: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'verification_token_expires_at' })
  verificationTokenExpiresAt!: Date | null;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true, name: 'reset_token' })
  resetToken!: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'reset_token_expires_at' })
  resetTokenExpiresAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'deleted_at' })
  deletedAt!: Date | null;

  @OneToOne(() => ProfileEntity, (profile) => profile.user)
  profile?: ProfileEntity;

  @OneToMany(() => PostEntity, (post) => post.author)
  posts?: PostEntity[];

  @OneToMany(() => GroupEntity, (group) => group.admin)
  administeredGroups?: GroupEntity[];

  @OneToMany(() => GroupMemberEntity, (member) => member.user)
  groupMemberships?: GroupMemberEntity[];

  @OneToMany(() => JoinRequestEntity, (request) => request.requester)
  joinRequests?: JoinRequestEntity[];

  @OneToMany(() => JoinRequestEntity, (request) => request.reviewer)
  reviewedJoinRequests?: JoinRequestEntity[];

  @OneToMany(() => AvailabilityEntity, (avail) => avail.user)
  availabilities?: AvailabilityEntity[];

  @OneToMany(() => ReviewEntity, (rev) => rev.reviewer)
  reviewsGiven?: ReviewEntity[];

  @OneToMany(() => ReviewEntity, (rev) => rev.reviewedUser)
  reviewsReceived?: ReviewEntity[];

  @OneToMany(() => NotificationEntity, (notif) => notif.user)
  notifications?: NotificationEntity[];

  @OneToMany(() => GroupMessageEntity, (msg) => msg.sender)
  sentMessages?: GroupMessageEntity[];

  @OneToMany(() => ReportEntity, (rep) => rep.reporter)
  reportsFiled?: ReportEntity[];

  @OneToMany(() => AppealEntity, (appeal) => appeal.user)
  appeals?: AppealEntity[];
}
