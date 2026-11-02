import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import { MessageStatus } from "../types/messaging.types";

/** Persiste el mensaje antes de emitirlo; clientMessageId evita duplicados al reintentar. */
@Entity("group_messages")
@Index("ix_group_messages_room", ["groupId", "createdAt"])
export class GroupMessageEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "group_id", type: "uuid" }) groupId!: string;
  @Column({ name: "sender_id", type: "uuid" }) senderId!: string;
  @Column({ type: "text" }) content!: string;
  @Column({ length: 20, default: "published" }) status!: MessageStatus;
  @Column({ name: "client_message_id", type: "uuid", nullable: true })
  clientMessageId!: string | null;
  @Column({ name: "reply_to_id", type: "uuid", nullable: true }) replyToId!:
    | string
    | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
