import {
  Entity,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProfileEntity } from './profile.entity';
import { SkillEntity } from './skill.entity';

@Entity('profile_skills')
export class ProfileSkillEntity {
  @PrimaryColumn('uuid', { name: 'profile_user_id' })
  profileUserId!: string;

  @PrimaryColumn('uuid', { name: 'skill_id' })
  skillId!: string;

  @ManyToOne(() => ProfileEntity, (profile) => profile.profileSkills, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_user_id' })
  profile?: ProfileEntity;

  @ManyToOne(() => SkillEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skill_id' })
  skill?: SkillEntity;
}
