import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ReportStatus, TargetContentType } from '../enums/moderation.enums';

// Denuncia de un alumno sobre una publicación, mensaje o reseña. El índice único parcial
// uq_reporter_target (init-db.sql) impide denunciar dos veces lo mismo mientras siga pendiente.
// resolved_by / resolved_at / resolution_notes los completa el panel de administración (SPEC-07).
@Entity('reports')
export class ContentReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'reporter_id' })
  reporterId!: string;

  @Column({ type: 'varchar', length: 20, name: 'target_type' })
  targetType!: TargetContentType;

  @Column('uuid', { name: 'target_id' })
  targetId!: string;

  @Column({ type: 'varchar', length: 255 })
  reason!: string;

  @Column({ type: 'varchar', length: 20, default: ReportStatus.PENDING })
  status!: ReportStatus;

  @Column('uuid', { name: 'resolved_by', nullable: true })
  resolvedBy!: string | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'text', name: 'resolution_notes', nullable: true })
  resolutionNotes!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
