import { Entity, PrimaryColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('revoked_tokens')
export class RevokedTokenEntity {
  // SHA-256 (hex) del token; nunca se guarda el token en claro
  @PrimaryColumn({ type: 'varchar', length: 64, name: 'token_hash' })
  tokenHash!: string;

  // FK a users(id) ON DELETE CASCADE definida en init-db.sql
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Index('ix_revoked_tokens_expires_at')
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'revoked_at' })
  revokedAt!: Date;
}
