import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

/** Modelo propio de SPEC-04: las referencias a otros dominios son UUID lógicos. */
@Entity("groups")
export class GroupEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ length: 100 }) name!: string;
  @Column({ type: "text", nullable: true }) description!: string | null;
  @Column({ name: "course_code", length: 20 }) courseCode!: string;
  @Column({ name: "leader_id", type: "uuid" }) leaderId!: string;
  @Column({ name: "meeting_mode", length: 20, default: "virtual" })
  meetingMode!: string;
  @Column({ name: "meeting_shift", length: 20, default: "manana" })
  meetingShift!: string;
  @Column({ name: "max_capacity", type: "int", default: 6 })
  maxCapacity!: number;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
