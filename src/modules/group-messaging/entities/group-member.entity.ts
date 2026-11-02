import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import { GroupRole, MemberStatus } from "../types/messaging.types";

/** La fila se conserva al salir o ser expulsado para mantener el historial de pertenencia. */
@Entity("group_members")
@Index("uq_group_user", ["groupId", "userId"], { unique: true })
export class GroupMemberEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "group_id", type: "uuid" }) groupId!: string;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({ length: 20, default: "member" }) role!: GroupRole;
  @Column({ length: 20, default: "active" }) status!: MemberStatus;
  @CreateDateColumn({ name: "joined_at", type: "timestamptz" }) joinedAt!: Date;
  @Column({ name: "left_at", type: "timestamptz", nullable: true })
  leftAt!: Date | null;
}
