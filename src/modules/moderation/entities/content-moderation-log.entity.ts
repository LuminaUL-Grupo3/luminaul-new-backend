import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ModerationResult, TargetContentType } from '../enums/moderation.enums';

// Registro de cada contenido ocultado por el motor. Se enlaza con publicaciones, mensajes y
// reseñas solo por UUID lógico (content_type + content_id), sin importar sus entidades
// (AGENTS.md §3.2). La clase lleva otro nombre para no chocar con la entidad heredada de Soft I.
@Entity('moderation_logs')
@Index('ix_moderation_logs_author', ['authorId'])
export class ContentModerationLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20, name: 'content_type' })
  contentType!: TargetContentType;

  @Column('uuid', { name: 'content_id' })
  contentId!: string;

  @Column('uuid', { name: 'author_id' })
  authorId!: string;

  @Column('text', { array: true, name: 'detected_words' })
  detectedWords!: string[];

  @Column({ type: 'varchar', length: 20, default: ModerationResult.BLOCKED })
  result!: ModerationResult;

  @CreateDateColumn({ type: 'timestamptz', name: 'moderated_at' })
  moderatedAt!: Date;
}
