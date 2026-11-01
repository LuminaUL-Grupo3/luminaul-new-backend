import { Entity, PrimaryColumn, Column, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { UserEntity } from '../../../users/entities/user.entity';

@Entity('profiles')
export class ProfileEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 150, nullable: false })
  name!: string;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  major!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'academic_cycle' })
  academicCycle!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'profile_photo_url' })
  profilePhotoUrl!: string | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  // Relación heredada: posts y grupos la usan para mostrar los datos del autor
  @OneToOne(() => UserEntity, (user) => user.profile)
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;
}
