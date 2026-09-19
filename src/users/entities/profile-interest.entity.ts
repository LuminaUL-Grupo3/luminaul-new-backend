import {
  Entity,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProfileEntity } from './profile.entity';
import { InterestEntity } from './interest.entity';

@Entity('profile_interests')
export class ProfileInterestEntity {
  @PrimaryColumn('uuid', { name: 'profile_user_id' })
  profileUserId!: string;

  @PrimaryColumn('uuid', { name: 'interest_id' })
  interestId!: string;

  @ManyToOne(() => ProfileEntity, (profile) => profile.profileInterests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_user_id' })
  profile?: ProfileEntity;

  @ManyToOne(() => InterestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'interest_id' })
  interest?: InterestEntity;
}
