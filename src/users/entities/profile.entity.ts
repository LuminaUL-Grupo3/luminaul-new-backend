import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

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
}
