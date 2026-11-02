import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { PostEntity } from '../../posts/entities/post.entity';

@Entity('courses')
export class CourseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: false })
  name!: string;

  @Column({ type: 'int', nullable: true })
  cycle!: number | null;

  @OneToMany(() => PostEntity, (post) => post.course)
  posts?: PostEntity[];
}
