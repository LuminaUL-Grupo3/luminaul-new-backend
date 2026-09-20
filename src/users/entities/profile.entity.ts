import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { SkillEntity } from './skill.entity';
import { ProfileSkillEntity } from './profile-skill.entity';
import { InterestEntity } from './interest.entity';
import { ProfileInterestEntity } from './profile-interest.entity';

@Entity('profiles')
export class ProfileEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  name!: string;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  major!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'academic_cycle' })
  academicCycle!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'profile_photo_url' })
  profilePhotoUrl!: string | null;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @OneToOne(() => UserEntity, (user) => user.profile)
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @ManyToMany(() => SkillEntity, (skill) => skill.profiles)
  @JoinTable({
    name: 'profile_skills',
    joinColumn: { name: 'profile_user_id', referencedColumnName: 'userId' },
    inverseJoinColumn: { name: 'skill_id', referencedColumnName: 'id' },
  })
  skills?: SkillEntity[];

  @OneToMany(() => ProfileSkillEntity, (profileSkill) => profileSkill.profile)
  profileSkills?: ProfileSkillEntity[];

  @ManyToMany(() => InterestEntity, (interest) => interest.profiles)
  @JoinTable({
    name: 'profile_interests',
    joinColumn: { name: 'profile_user_id', referencedColumnName: 'userId' },
    inverseJoinColumn: { name: 'interest_id', referencedColumnName: 'id' },
  })
  interests?: InterestEntity[];

  @OneToMany(() => ProfileInterestEntity, (profileInterest) => profileInterest.profile)
  profileInterests?: ProfileInterestEntity[];
}
