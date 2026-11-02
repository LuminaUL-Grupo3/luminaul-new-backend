import { MigrationInterface, QueryRunner } from "typeorm";

/** Extiende únicamente tablas del chat; no reinicia la base ni cambia cuentas o publicaciones. */
export class ChatInteractions1762041600000 implements MigrationInterface {
  /** Agrega claves de reintento, respuestas, reacciones y marcadores de lectura de forma idempotente. */
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS client_message_id UUID;
      ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES group_messages(id) ON DELETE SET NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_group_messages_retry ON group_messages(group_id,sender_id,client_message_id) WHERE client_message_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_group_messages_page ON group_messages(group_id,created_at DESC,id DESC);
      CREATE TABLE IF NOT EXISTS message_reactions (
        message_id UUID NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji VARCHAR(16) NOT NULL CHECK(emoji IN ('❤️','😂','👍','🔥')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(message_id,user_id,emoji)
      );
      CREATE TABLE IF NOT EXISTS group_read_markers (
        group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_message_id UUID NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
        last_created_at TIMESTAMPTZ NOT NULL,
        read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(group_id,user_id)
      );
    `);
  }
  /** Revierte solo esta extensión; debe usarse tras respaldar reacciones y lecturas. */
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS group_read_markers; DROP TABLE IF EXISTS message_reactions;
      DROP INDEX IF EXISTS ux_group_messages_retry; DROP INDEX IF EXISTS ix_group_messages_page;
      ALTER TABLE group_messages DROP COLUMN IF EXISTS reply_to_id;
      ALTER TABLE group_messages DROP COLUMN IF EXISTS client_message_id;`);
  }
}
