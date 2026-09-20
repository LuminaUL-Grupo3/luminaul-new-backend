import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
} from 'typeorm';
import { ProfileEntity } from './profile.entity';

@Entity('skills')
export class SkillEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: false })
  name!: string;

  @ManyToMany(() => ProfileEntity, (profile) => profile.skills)
  profiles?: ProfileEntity[];
}
