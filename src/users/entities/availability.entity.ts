import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('availabilities')
@Index('ix_availabilities_user_day', ['userId', 'dayOfWeek'])
export class AvailabilityEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'user_id', nullable: false })
  userId!: string;

  @Column({ type: 'varchar', length: 20, name: 'day_of_week', nullable: false })
  dayOfWeek!: string;

  @Column({ type: 'time', name: 'start_time', nullable: false })
  startTime!: string;

  @Column({ type: 'time', name: 'end_time', nullable: false })
  endTime!: string;

  @ManyToOne(() => UserEntity, (user) => user.availabilities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;
}
