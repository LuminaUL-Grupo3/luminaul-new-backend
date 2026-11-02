import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";
import { RequestStatus } from "../types/messaging.types";

/** La decisión se coordina con el cupo y la membresía dentro de una transacción. */
@Entity("join_requests")
export class JoinRequestEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "group_id", type: "uuid" }) groupId!: string;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({ type: "varchar", length: 255, nullable: true }) message!:
    | string
    | null;
  @Column({ length: 20, default: "pending" }) status!: RequestStatus;
  @Column({ name: "reviewed_by", type: "uuid", nullable: true }) reviewedBy!:
    | string
    | null;
  @Column({ name: "responded_at", type: "timestamptz", nullable: true })
  respondedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
