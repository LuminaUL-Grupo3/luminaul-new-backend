import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

@Entity('courses')
export class CourseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: false })
  name!: string;

  @Column({ type: 'int', nullable: true })
  cycle!: number | null;
}
