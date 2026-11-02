import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Bitácora de decisiones del administrador (quién, qué, sobre qué y con qué datos)
@Entity('audit_logs')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'admin_id' })
  adminId!: string;

  @Column({ type: 'varchar', length: 50 })
  action!: string;

  @Column({ type: 'varchar', length: 50, name: 'target_entity' })
  targetEntity!: string;

  @Column('uuid', { name: 'target_id' })
  targetId!: string;

  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
