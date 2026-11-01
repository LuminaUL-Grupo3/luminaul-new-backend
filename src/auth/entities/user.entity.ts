import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { UserRole } from '../enums/user-role.enum';
import { UserAccountStatus } from '../enums/user-account-status.enum';

// Sin relaciones hacia entidades de otros módulos (AGENTS.md §3.2):
// perfiles, posts, grupos, etc. referencian a users solo por su UUID lógico.
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('ix_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  // Hash bcrypt (10 rondas); nunca se expone en respuestas
  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'varchar', length: 50, default: UserRole.STUDENT })
  role!: UserRole;

  @Index('ix_users_status')
  @Column({ type: 'varchar', length: 50, default: UserAccountStatus.PENDING_VERIFICATION })
  status!: UserAccountStatus;

  @Column({ type: 'boolean', name: 'is_verified', default: false })
  isVerified!: boolean;

  // Código OTP de 6 dígitos; sin UNIQUE para evitar colisiones entre usuarios
  @Column({ type: 'varchar', length: 10, name: 'verification_token', nullable: true })
  verificationToken!: string | null;

  @Column({ type: 'timestamptz', name: 'verification_token_expires_at', nullable: true })
  verificationTokenExpiresAt!: Date | null;

  @Column({ type: 'varchar', length: 10, name: 'reset_token', nullable: true })
  resetToken!: string | null;

  @Column({ type: 'timestamptz', name: 'reset_token_expires_at', nullable: true })
  resetTokenExpiresAt!: Date | null;

  // Todo JWT con iat anterior a esta marca se rechaza (suspensión, reset, borrado)
  @Column({
    type: 'timestamptz',
    name: 'tokens_valid_after',
    default: () => 'CURRENT_TIMESTAMP',
  })
  tokensValidAfter!: Date;

  @Column({ type: 'text', name: 'suspension_reason', nullable: true })
  suspensionReason!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  // Columna simple (no @DeleteDateColumn): el soft-delete se gobierna por status
  // y las consultas de login/registro deben seguir viendo a los usuarios borrados.
  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
