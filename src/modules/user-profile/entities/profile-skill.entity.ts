import { Entity, PrimaryColumn } from 'typeorm';

@Entity('profile_skills')
export class ProfileSkillEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId!: string;

  @PrimaryColumn({ type: 'varchar', length: 50, name: 'skill_name' })
  skillName!: string;
}
