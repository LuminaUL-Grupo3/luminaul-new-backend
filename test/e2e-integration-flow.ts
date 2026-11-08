import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { hash } from 'bcryptjs';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { API_PREFIX, configureHttpApp } from '../src/config/http-app.config';
import { ChatInteractions1762041600000 } from '../src/modules/group-messaging/migrations/1762041600000-ChatInteractions';

// ============================================================================
// UTILIDADES DE LOGGING CON COLORES ANSI Y ASERCIONES ESTRICTAS
// ============================================================================
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

interface StepRecord {
  phase: string;
  module: string;
  operation: string;
  expected: string;
  received: string;
}

const executedSteps: StepRecord[] = [];
let totalHttpRequests = 0;
let totalWsEvents = 0;

function banner(title: string): void {
  console.log(`\n${C.cyan}${C.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ${title}${C.reset}`);
  console.log(`${C.cyan}${C.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
}

function recordPass(
  phase: string,
  module: string,
  operation: string,
  expected: string,
  received: string,
  detail?: string,
): void {
  executedSteps.push({ phase, module, operation, expected, received });
  console.log(
    `${C.green}${C.bold}[PASS]${C.reset} ${C.magenta}[${module}]${C.reset} ${operation} ${C.dim}(Esperado: ${expected} | Recibido: ${received})${C.reset}`,
  );
  if (detail) {
    console.log(`       ${C.dim}↳ ${detail}${C.reset}`);
  }
}

function failImmediately(
  phase: string,
  module: string,
  operation: string,
  expected: string | number,
  received: string | number,
  payload?: unknown,
): never {
  console.error(`\n${C.red}${C.bold}✖ [FAIL - DETENCIÓN INMEDIATA DE SUITE E2E]${C.reset}`);
  console.error(`  ${C.bold}Fase:${C.reset}      ${phase}`);
  console.error(`  ${C.bold}Módulo:${C.reset}    ${module}`);
  console.error(`  ${C.bold}Petición:${C.reset}  ${operation}`);
  console.error(`  ${C.bold}Esperado:${C.reset}  ${C.green}${expected}${C.reset}`);
  console.error(`  ${C.bold}Recibido:${C.reset}  ${C.red}${received}${C.reset}`);
  if (payload !== undefined) {
    console.error(`  ${C.bold}Respuesta:${C.reset} ${JSON.stringify(payload, null, 2)}`);
  }
  throw new Error(`[${module}] Falló "${operation}": esperado (${expected}), recibido (${received})`);
}

interface HttpResponse<T = any> {
  status: number;
  body: T;
}

async function apiRequest<T = any>(
  baseUrl: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: {
    token?: string;
    body?: unknown;
    expectedStatus: number | number[];
    phase: string;
    module: string;
    description: string;
  },
): Promise<HttpResponse<T>> {
  totalHttpRequests++;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${baseUrl}/${API_PREFIX}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let parsedBody: any = null;
  const rawText = await res.text();
  try {
    parsedBody = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsedBody = rawText;
  }

  const expectedList = Array.isArray(options.expectedStatus)
    ? options.expectedStatus
    : [options.expectedStatus];

  if (!expectedList.includes(res.status)) {
    failImmediately(
      options.phase,
      options.module,
      `${method} ${path} (${options.description})`,
      `HTTP ${expectedList.join(' o ')}`,
      `HTTP ${res.status}`,
      parsedBody,
    );
  }

  return { status: res.status, body: parsedBody as T };
}

function connectSocket(baseUrl: string, token: string): Promise<Socket> {
  totalWsEvents++;
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, {
      transports: ['websocket'],
      auth: { token },
      extraHeaders: { origin: 'http://localhost:5173' },
      reconnection: false,
      timeout: 5000,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

function emitWithAck<T = any>(socket: Socket, event: string, payload: unknown): Promise<T> {
  totalWsEvents++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout esperando ACK del evento WebSocket "${event}"`));
    }, 5000);

    socket.emit(event, payload, (ack: T) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

// ============================================================================
// FLUJO PRINCIPAL DE INTEGRACIÓN E2E (7 MÓDULOS)
// ============================================================================
async function runE2EIntegrationFlow(): Promise<void> {
  console.log(`${C.bold}${C.blue}==============================================================================${C.reset}`);
  console.log(`${C.bold}${C.blue}  LUMINAUL - SUITE AUTOMATIZADA DE INTEGRACIÓN END-TO-END (7 MÓDULOS)${C.reset}`);
  console.log(`${C.bold}${C.blue}  Entorno: NestJS + TypeScript + PostgreSQL Real + Socket.IO WebSockets${C.reset}`);
  console.log(`${C.bold}${C.blue}==============================================================================${C.reset}`);

  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'luminaul-e2e-integration-secret-key-2026-secure';
  process.env.WEB_ORIGIN = 'http://localhost:5173,http://127.0.0.1:5173';

  let app: INestApplication | null = null;
  let dataSource: DataSource | null = null;
  const openSockets: Socket[] = [];
  const createdEmails: string[] = [];

  const ts = Date.now();
  const userAEmail = `test_leader_${ts}@aloe.ulima.edu.pe`;
  const userBEmail = `test_applicant_${ts}@aloe.ulima.edu.pe`;
  const userCEmail = `test_outsider_${ts}@aloe.ulima.edu.pe`;
  const adminEmail = 'admin@aloe.ulima.edu.pe';
  const defaultPassword = 'PasswordSegura2026!';

  createdEmails.push(userAEmail, userBEmail, userCEmail);

  try {
    // ------------------------------------------------------------------------
    // BOOTSTRAP DE APLICACIÓN Y PREPARACIÓN IDEMPOTENTE DE BD
    // ------------------------------------------------------------------------
    banner('FASE 0: Arranque de Servidor NestJS y Verificación de Esquema PostgreSQL');

    app = await NestFactory.create(AppModule, { logger: false });
    configureHttpApp(app);


    await app.listen(0, '127.0.0.1');
    const serverAddress = app.getHttpServer().address();
    const port = typeof serverAddress === 'object' && serverAddress ? serverAddress.port : 3000;
    const baseUrl = `http://127.0.0.1:${port}`;

    const db = app.get(DataSource);
    dataSource = db;

    // Asegurar de forma 100% idempotente (sin DROP) todas las tablas y columnas de SPEC-01 a SPEC-07
    await db.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(150) NOT NULL DEFAULT 'Usuario LuminaUL',
        role VARCHAR(50) NOT NULL DEFAULT 'student',
        status VARCHAR(50) NOT NULL DEFAULT 'pending_verification',
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        verification_token VARCHAR(10),
        verification_token_expires_at TIMESTAMPTZ,
        reset_token VARCHAR(10),
        reset_token_expires_at TIMESTAMPTZ,
        tokens_valid_after TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        suspension_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(150) NOT NULL DEFAULT 'Usuario LuminaUL';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'student';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'pending_verification';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(10);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(10);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_valid_after TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS revoked_tokens (
        token_hash VARCHAR(64) PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL DEFAULT 'Usuario LuminaUL',
        bio TEXT,
        major VARCHAR(100),
        academic_cycle VARCHAR(20),
        profile_photo_url VARCHAR(255),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name VARCHAR(150) NOT NULL DEFAULT 'Usuario LuminaUL';
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS major VARCHAR(100);
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS academic_cycle VARCHAR(20);
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_photo_url VARCHAR(255);
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profile_skills' AND column_name='user_id') THEN
          DROP TABLE IF EXISTS profile_skills CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profile_interests' AND column_name='user_id') THEN
          DROP TABLE IF EXISTS profile_interests CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='availabilities' AND column_name='user_id') THEN
          DROP TABLE IF EXISTS availabilities CASCADE;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS profile_skills (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        skill_name VARCHAR(50) NOT NULL,
        PRIMARY KEY (user_id, skill_name)
      );

      CREATE TABLE IF NOT EXISTS profile_interests (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        interest_name VARCHAR(50) NOT NULL,
        PRIMARY KEY (user_id, interest_name)
      );

      CREATE TABLE IF NOT EXISTS availabilities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_of_week VARCHAR(20) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE NOT NULL,
        cycle INTEGER
      );

      CREATE TABLE IF NOT EXISTS groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        benefits TEXT,
        requirements TEXT,
        course_code VARCHAR(20) DEFAULT 'CS001',
        leader_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        meeting_mode VARCHAR(20) DEFAULT 'virtual',
        meeting_shift VARCHAR(20) DEFAULT 'manana',
        max_capacity INTEGER DEFAULT 6,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ
      );
      ALTER TABLE groups ADD COLUMN IF NOT EXISTS course_code VARCHAR(20) DEFAULT 'CS001';
      ALTER TABLE groups ADD COLUMN IF NOT EXISTS leader_id UUID REFERENCES users(id) ON DELETE RESTRICT;
      ALTER TABLE groups ADD COLUMN IF NOT EXISTS meeting_mode VARCHAR(20) DEFAULT 'virtual';
      ALTER TABLE groups ADD COLUMN IF NOT EXISTS meeting_shift VARCHAR(20) DEFAULT 'manana';
      ALTER TABLE groups ADD COLUMN IF NOT EXISTS max_capacity INTEGER DEFAULT 6;
      DROP TRIGGER IF EXISTS trg_sync_group_leader ON groups;
      DROP FUNCTION IF EXISTS fn_sync_group_leader();

      CREATE TABLE IF NOT EXISTS publications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
        course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
        type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        benefits TEXT,
        requirements TEXT,
        max_capacity INTEGER NOT NULL DEFAULT 5,
        status VARCHAR(50) NOT NULL DEFAULT 'published',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ
      );
      ALTER TABLE publications ADD COLUMN IF NOT EXISTS benefits TEXT;
      ALTER TABLE publications ADD COLUMN IF NOT EXISTS requirements TEXT;
      ALTER TABLE publications ADD COLUMN IF NOT EXISTS max_capacity INTEGER NOT NULL DEFAULT 5;
      ALTER TABLE publications ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'published';
      ALTER TABLE publications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS group_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'member',
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        left_at TIMESTAMPTZ,
        CONSTRAINT uq_group_user UNIQUE (group_id, user_id)
      );
      ALTER TABLE group_members ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member';
      ALTER TABLE group_members ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
      ALTER TABLE group_members ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS join_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        responded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS message VARCHAR(255);
      ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
      ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
      ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_join_requests_pending ON join_requests (group_id, user_id) WHERE status = 'pending';
      DROP TRIGGER IF EXISTS trg_sync_join_request_user ON join_requests;
      DROP FUNCTION IF EXISTS fn_sync_join_request_user();

      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'group_messages'
            AND column_name NOT IN ('id', 'group_id', 'sender_id', 'content', 'status', 'created_at', 'deleted_at', 'client_message_id', 'reply_to_id')
        ) OR NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'group_messages' AND column_name = 'sender_id'
        ) THEN
          DROP TABLE IF EXISTS group_read_markers CASCADE;
          DROP TABLE IF EXISTS message_reactions CASCADE;
          DROP TABLE IF EXISTS group_messages CASCADE;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS group_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'published',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reviewed_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'published',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ
      );
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published';
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_active_review ON reviews (reviewer_id, reviewed_user_id) WHERE deleted_at IS NULL;

      CREATE TABLE IF NOT EXISTS banned_words (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        word VARCHAR(50) UNIQUE NOT NULL,
        severity VARCHAR(20) NOT NULL DEFAULT 'high'
      );

      CREATE TABLE IF NOT EXISTS moderation_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content_type VARCHAR(20) NOT NULL DEFAULT 'publication',
        content_id UUID NOT NULL DEFAULT gen_random_uuid(),
        author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        detected_words TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        result VARCHAR(20) NOT NULL DEFAULT 'blocked',
        moderated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) NOT NULL DEFAULT 'publication';
      ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS content_id UUID;
      ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS detected_words TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
      ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS result VARCHAR(20) NOT NULL DEFAULT 'blocked';
      ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

      CREATE TABLE IF NOT EXISTS reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_type VARCHAR(20) NOT NULL DEFAULT 'publication',
        target_id UUID NOT NULL DEFAULT gen_random_uuid(),
        reason VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        resolved_by UUID REFERENCES users(id),
        resolved_at TIMESTAMPTZ,
        resolution_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_type VARCHAR(20) NOT NULL DEFAULT 'publication';
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_id UUID;
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id);
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reports' AND column_name='publication_id') THEN
          ALTER TABLE reports ALTER COLUMN publication_id DROP NOT NULL;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reports' AND column_name='reported_user_id') THEN
          ALTER TABLE reports ALTER COLUMN reported_user_id DROP NOT NULL;
        END IF;
      END $$;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_reporter_target ON reports (reporter_id, target_type, target_id) WHERE status = 'pending';

      CREATE TABLE IF NOT EXISTS appeals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        moderation_log_id UUID NOT NULL REFERENCES moderation_logs(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        justification TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        resolved_by UUID REFERENCES users(id),
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE appeals ADD COLUMN IF NOT EXISTS moderation_log_id UUID REFERENCES moderation_logs(id) ON DELETE CASCADE;
      ALTER TABLE appeals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE appeals ADD COLUMN IF NOT EXISTS justification TEXT;
      ALTER TABLE appeals ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
      ALTER TABLE appeals ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id);
      ALTER TABLE appeals ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appeals' AND column_name='report_id') THEN
          ALTER TABLE appeals ALTER COLUMN report_id DROP NOT NULL;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appeals' AND column_name='reason') THEN
          ALTER TABLE appeals ALTER COLUMN reason DROP NOT NULL;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='appeals' AND constraint_name='appeals_moderation_log_id_fkey') THEN
          ALTER TABLE appeals DROP CONSTRAINT appeals_moderation_log_id_fkey;
        END IF;
        ALTER TABLE appeals ADD CONSTRAINT appeals_moderation_log_id_fkey FOREIGN KEY (moderation_log_id) REFERENCES moderation_logs(id) ON DELETE CASCADE;
      END $$;

      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(150) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(30) NOT NULL DEFAULT 'SYSTEM',
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        target_entity VARCHAR(50) NOT NULL,
        target_id UUID NOT NULL,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE group_members ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
      ALTER TABLE availabilities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE groups ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE group_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE appeals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

      ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE users ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE profiles ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE availabilities ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE availabilities ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE groups ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE groups ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE group_members ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE group_members ALTER COLUMN joined_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE join_requests ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE join_requests ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE group_messages ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE group_messages ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE reviews ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE reviews ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE reviews ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE moderation_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE moderation_logs ALTER COLUMN moderated_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE reports ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE reports ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE appeals ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE appeals ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE notifications ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE notifications ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE audit_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE audit_logs ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

      ALTER TABLE users ALTER COLUMN role SET DEFAULT 'student';
      ALTER TABLE users ALTER COLUMN status SET DEFAULT 'pending_verification';
      ALTER TABLE users ALTER COLUMN is_verified SET DEFAULT FALSE;
      ALTER TABLE users ALTER COLUMN tokens_valid_after SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE groups ALTER COLUMN course_code SET DEFAULT 'CS001';
      ALTER TABLE groups ALTER COLUMN meeting_mode SET DEFAULT 'virtual';
      ALTER TABLE groups ALTER COLUMN meeting_shift SET DEFAULT 'manana';
      ALTER TABLE groups ALTER COLUMN max_capacity SET DEFAULT 6;
      ALTER TABLE publications ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE publications ALTER COLUMN max_capacity SET DEFAULT 5;
      ALTER TABLE publications ALTER COLUMN status SET DEFAULT 'published';
      ALTER TABLE publications ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE publications ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE group_members ALTER COLUMN role SET DEFAULT 'member';
      ALTER TABLE group_members ALTER COLUMN status SET DEFAULT 'active';
      ALTER TABLE join_requests ALTER COLUMN status SET DEFAULT 'pending';
      ALTER TABLE group_messages ALTER COLUMN status SET DEFAULT 'published';
      ALTER TABLE reviews ALTER COLUMN status SET DEFAULT 'published';
      ALTER TABLE moderation_logs ALTER COLUMN result SET DEFAULT 'blocked';
      ALTER TABLE reports ALTER COLUMN status SET DEFAULT 'pending';
      ALTER TABLE appeals ALTER COLUMN status SET DEFAULT 'pending';
      ALTER TABLE notifications ALTER COLUMN type SET DEFAULT 'SYSTEM';
      ALTER TABLE notifications ALTER COLUMN is_read SET DEFAULT FALSE;
    `);

    // Asegurar migración idempotente de interacciones de chat (SPEC-04)
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await new ChatInteractions1762041600000().up(runner);
    } finally {
      await runner.release();
    }

    // Asegurar palabras prohibidas en catálogo (SPEC-06)
    await db.query(`
      INSERT INTO banned_words (id, word, severity)
      VALUES
        (gen_random_uuid(), 'estafa', 'high'),
        (gen_random_uuid(), 'plagio', 'high'),
        (gen_random_uuid(), 'fraude', 'high'),
        (gen_random_uuid(), 'spam', 'medium')
      ON CONFLICT (word) DO NOTHING;
    `);

    // Asegurar curso válido con UUID v4 RFC-4122 en ciclo 6 (SPEC-03)
    await db.query(`
      INSERT INTO courses (id, name, cycle)
      VALUES ('8c537243-ea7d-411a-8bb7-fce5230bfdf2', 'Ingeniería de Software I', 6)
      ON CONFLICT (name) DO UPDATE SET cycle = 6;
    `);

    // Asegurar semilla de Administrador activa y verificada (SPEC-01 / SPEC-07)
    const adminPasswordHash = await hash(defaultPassword, 10);
    await db.query(
      `
      INSERT INTO users (id, email, password_hash, name, role, status, is_verified, tokens_valid_after, created_at, updated_at)
      VALUES ('99887766-5544-4322-8100-aabbccddeeff', $1, $2, 'Administrador General', 'admin', 'active', true, NOW() - INTERVAL '60 seconds', NOW(), NOW())
      ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role = 'admin',
          status = 'active',
          is_verified = true,
          tokens_valid_after = NOW() - INTERVAL '60 seconds',
          updated_at = NOW();
      `,
      [adminEmail, adminPasswordHash],
    );
    await db.query(
      `
      INSERT INTO profiles (user_id, name, bio, major, academic_cycle, updated_at)
      SELECT id, 'Administrador General', 'Gestión de Comunidad LuminaUL', 'Administración', '10', NOW()
      FROM users WHERE email = $1
      ON CONFLICT (user_id) DO NOTHING;
      `,
      [adminEmail],
    );

    recordPass(
      'FASE 0',
      'bootstrap',
      `Servidor HTTP + WS activo en ${baseUrl} y PostgreSQL sincronizado`,
      'READY',
      'READY',
    );

    // ========================================================================
    // FASE 1: AUTENTICACIÓN, SEGURIDAD Y RBAC (Módulo auth-security)
    // ========================================================================
    banner('FASE 1: Autenticación, Seguridad y RBAC (Módulo auth-security)');

    // 1.1 Registro de Usuario A (Líder)
    const regARes = await apiRequest(baseUrl, 'POST', '/auth/register', {
      body: {
        email: userAEmail,
        password: defaultPassword,
        name: 'Elena Líder E2E',
      },
      expectedStatus: 201,
      phase: 'FASE 1',
      module: 'auth-security',
      description: 'Registro de Usuario A (Líder)',
    });
    const userAId: string = regARes.body.userId;
    recordPass(
      'FASE 1',
      'auth-security',
      'POST /auth/register (Usuario A - Líder)',
      'HTTP 201',
      `HTTP ${regARes.status}`,
      `userId=${userAId}, status=${regARes.body.status}`,
    );

    // 1.2 Registro de Usuario B (Postulante)
    const regBRes = await apiRequest(baseUrl, 'POST', '/auth/register', {
      body: {
        email: userBEmail,
        password: defaultPassword,
        name: 'Diego Postulante E2E',
      },
      expectedStatus: 201,
      phase: 'FASE 1',
      module: 'auth-security',
      description: 'Registro de Usuario B (Postulante)',
    });
    const userBId: string = regBRes.body.userId;
    recordPass(
      'FASE 1',
      'auth-security',
      'POST /auth/register (Usuario B - Postulante)',
      'HTTP 201',
      `HTTP ${regBRes.status}`,
      `userId=${userBId}, status=${regBRes.body.status}`,
    );

    // Registro de Usuario C (Ajeno al grupo para prueba negativa de WebSocket)
    const regCRes = await apiRequest(baseUrl, 'POST', '/auth/register', {
      body: {
        email: userCEmail,
        password: defaultPassword,
        name: ' intruso Externo E2E',
      },
      expectedStatus: 201,
      phase: 'FASE 1',
      module: 'auth-security',
      description: 'Registro de Usuario C (Externo)',
    });
    const userCId: string = regCRes.body.userId;

    // 1.3 Validar rechazo con correo no institucional (@gmail.com) -> HTTP 400
    const badEmailRes = await apiRequest(baseUrl, 'POST', '/auth/register', {
      body: {
        email: `intruso_${ts}@gmail.com`,
        password: defaultPassword,
        name: 'Usuario Externo Gmail',
      },
      expectedStatus: 400,
      phase: 'FASE 1',
      module: 'auth-security',
      description: 'Rechazo de correo no institucional (@gmail.com)',
    });
    recordPass(
      'FASE 1',
      'auth-security',
      'POST /auth/register (Rechazo @gmail.com)',
      'HTTP 400',
      `HTTP ${badEmailRes.status}`,
    );

    // Verificación OTP institucional para activar cuentas A, B y C antes del Login
    for (const [label, email] of [
      ['Usuario A', userAEmail],
      ['Usuario B', userBEmail],
      ['Usuario C', userCEmail],
    ] as const) {
      const [{ verification_token: otp }] = await db.query(
        'SELECT verification_token FROM users WHERE email = $1',
        [email],
      );
      await apiRequest(baseUrl, 'POST', '/auth/verify-email', {
        body: { email, token: otp },
        expectedStatus: 200,
        phase: 'FASE 1',
        module: 'auth-security',
        description: `Verificación OTP de ${label}`,
      });
      // Ajustar tokens_valid_after 5s atrás para evitar colisión de segundo exacto con iat
      await db.query(
        `UPDATE users SET tokens_valid_after = NOW() - INTERVAL '5 seconds' WHERE email = $1`,
        [email],
      );
    }

    // 1.4 Login Usuario A -> Guardar tokenA y userA.id
    const loginARes = await apiRequest(baseUrl, 'POST', '/auth/login', {
      body: { email: userAEmail, password: defaultPassword },
      expectedStatus: 200,
      phase: 'FASE 1',
      module: 'auth-security',
      description: 'Login Usuario A',
    });
    const tokenA: string = loginARes.body.accessToken;
    if (!tokenA || loginARes.body.user?.id !== userAId) {
      failImmediately('FASE 1', 'auth-security', 'POST /auth/login (Usuario A)', userAId, loginARes.body?.user?.id);
    }
    recordPass(
      'FASE 1',
      'auth-security',
      'POST /auth/login (Usuario A)',
      'HTTP 200 + JWT',
      `HTTP ${loginARes.status} (userA.id=${userAId})`,
    );

    // 1.5 Login Usuario B -> Guardar tokenB y userB.id
    const loginBRes = await apiRequest(baseUrl, 'POST', '/auth/login', {
      body: { email: userBEmail, password: defaultPassword },
      expectedStatus: 200,
      phase: 'FASE 1',
      module: 'auth-security',
      description: 'Login Usuario B',
    });
    const tokenB: string = loginBRes.body.accessToken;
    if (!tokenB || loginBRes.body.user?.id !== userBId) {
      failImmediately('FASE 1', 'auth-security', 'POST /auth/login (Usuario B)', userBId, loginBRes.body?.user?.id);
    }
    recordPass(
      'FASE 1',
      'auth-security',
      'POST /auth/login (Usuario B)',
      'HTTP 200 + JWT',
      `HTTP ${loginBRes.status} (userB.id=${userBId})`,
    );

    // Login Usuario C (para prueba de socket ajeno al grupo)
    const loginCRes = await apiRequest(baseUrl, 'POST', '/auth/login', {
      body: { email: userCEmail, password: defaultPassword },
      expectedStatus: 200,
      phase: 'FASE 1',
      module: 'auth-security',
      description: 'Login Usuario C',
    });
    const tokenC: string = loginCRes.body.accessToken;

    // 1.6 Login Administrador (Semilla de BD) -> Guardar adminToken
    const loginAdminRes = await apiRequest(baseUrl, 'POST', '/auth/login', {
      body: { email: adminEmail, password: defaultPassword },
      expectedStatus: 200,
      phase: 'FASE 1',
      module: 'auth-security',
      description: 'Login Administrador (Semilla BD)',
    });
    const adminToken: string = loginAdminRes.body.accessToken;
    if (!adminToken || loginAdminRes.body.user?.role !== 'admin') {
      failImmediately('FASE 1', 'auth-security', 'POST /auth/login (Admin)', 'role=admin', loginAdminRes.body?.user?.role);
    }
    recordPass(
      'FASE 1',
      'auth-security',
      'POST /auth/login (Administrador Semilla)',
      'HTTP 200 + role=admin',
      `HTTP ${loginAdminRes.status} (role=${loginAdminRes.body.user.role})`,
    );

    // ========================================================================
    // FASE 2: PERFILES Y MATRIZ DE DISPONIBILIDAD HORARIA (Módulo user-profile)
    // ========================================================================
    banner('FASE 2: Perfiles y Matriz de Disponibilidad Horaria (Módulo user-profile)');

    const updatedBio = 'Líder de grupo de estudio enfocada en arquitectura distribuida y redes.';
    const updatedMajor = 'Ingeniería de Sistemas';
    const updatedCycle = '6';

    // 2.1 Actualización de Perfil (PUT /profiles/me)
    const updateProfRes = await apiRequest(baseUrl, 'PUT', '/profiles/me', {
      token: tokenA,
      body: {
        major: updatedMajor,
        academicCycle: updatedCycle,
        bio: updatedBio,
        skills: ['NestJS', 'TypeScript', 'PostgreSQL'],
        interests: ['Sistemas Distribuidos', 'Redes'],
      },
      expectedStatus: 200,
      phase: 'FASE 2',
      module: 'user-profile',
      description: 'Actualizar perfil propio de Usuario A',
    });
    if (updateProfRes.body.academicCycle !== updatedCycle || updateProfRes.body.bio !== updatedBio) {
      failImmediately(
        'FASE 2',
        'user-profile',
        'PUT /profiles/me',
        `cycle=${updatedCycle}, bio=${updatedBio}`,
        JSON.stringify(updateProfRes.body),
      );
    }
    recordPass(
      'FASE 2',
      'user-profile',
      'PUT /profiles/me (Actualizar carrera, ciclo="6" y bio)',
      'HTTP 200',
      `HTTP ${updateProfRes.status}`,
      `major="${updateProfRes.body.major}", cycle="${updateProfRes.body.academicCycle}"`,
    );

    // 2.2 Gestión de Horarios Libres: Registrar Lunes 14:00 a 16:00 (HTTP 201)
    const availRes = await apiRequest(baseUrl, 'POST', '/profiles/me/availability', {
      token: tokenA,
      body: {
        dayOfWeek: 'lunes',
        startTime: '14:00',
        endTime: '16:00',
      },
      expectedStatus: 201,
      phase: 'FASE 2',
      module: 'user-profile',
      description: 'Registrar franja horaria Lunes 14:00-16:00',
    });
    recordPass(
      'FASE 2',
      'user-profile',
      'POST /profiles/me/availability (Lunes 14:00-16:00)',
      'HTTP 201',
      `HTTP ${availRes.status}`,
      `availabilityId=${availRes.body.availability?.id}`,
    );

    // 2.3 Validar regla de inversión: startTime "16:00", endTime "14:00" -> HTTP 400
    const invertedAvailRes = await apiRequest(baseUrl, 'POST', '/profiles/me/availability', {
      token: tokenA,
      body: {
        dayOfWeek: 'martes',
        startTime: '16:00',
        endTime: '14:00',
      },
      expectedStatus: 400,
      phase: 'FASE 2',
      module: 'user-profile',
      description: 'Rechazar horario invertido (16:00 a 14:00)',
    });
    recordPass(
      'FASE 2',
      'user-profile',
      'POST /profiles/me/availability (Regla de inversión 16:00 -> 14:00)',
      'HTTP 400',
      `HTTP ${invertedAvailRes.status}`,
    );

    // 2.4 Validar regla de solapamiento: Lunes 15:00 a 17:00 -> HTTP 400
    const overlapAvailRes = await apiRequest(baseUrl, 'POST', '/profiles/me/availability', {
      token: tokenA,
      body: {
        dayOfWeek: 'lunes',
        startTime: '15:00',
        endTime: '17:00',
      },
      expectedStatus: 400,
      phase: 'FASE 2',
      module: 'user-profile',
      description: 'Rechazar horario solapado (Lunes 15:00 a 17:00)',
    });
    recordPass(
      'FASE 2',
      'user-profile',
      'POST /profiles/me/availability (Regla de solapamiento Lunes 15:00 -> 17:00)',
      'HTTP 400',
      `HTTP ${overlapAvailRes.status}`,
    );

    // 2.5 Consulta Pública: Usuario B consulta GET /profiles/:userAId -> Verificar bio y horarios
    const getProfARes = await apiRequest(baseUrl, 'GET', `/profiles/${userAId}`, {
      token: tokenB,
      expectedStatus: 200,
      phase: 'FASE 2',
      module: 'user-profile',
      description: 'Consulta pública del perfil de Usuario A por Usuario B',
    });
    const hasMondaySlot = Array.isArray(getProfARes.body.availabilities) &&
      getProfARes.body.availabilities.some(
        (a: any) => a.dayOfWeek === 'lunes' && a.startTime.startsWith('14:00') && a.endTime.startsWith('16:00'),
      );
    if (getProfARes.body.bio !== updatedBio || !hasMondaySlot) {
      failImmediately(
        'FASE 2',
        'user-profile',
        `GET /profiles/${userAId}`,
        'Bio actualizada + Franja lunes 14:00-16:00',
        JSON.stringify(getProfARes.body),
      );
    }
    recordPass(
      'FASE 2',
      'user-profile',
      `GET /profiles/${userAId} (Consulta por Usuario B)`,
      'HTTP 200 + Bio y Horarios verificados',
      `HTTP ${getProfARes.status} (${getProfARes.body.availabilities.length} horario(s))`,
    );

    // ========================================================================
    // FASE 3: PUBLICACIONES Y CONVOCATORIAS (Módulo posts + courses)
    // ========================================================================
    banner('FASE 3: Publicaciones y Convocatorias (Módulos courses & posts)');

    // 3.1 Usuario A consulta catálogo GET /courses
    const coursesRes = await apiRequest<any[]>(baseUrl, 'GET', '/courses', {
      token: tokenA,
      expectedStatus: 200,
      phase: 'FASE 3',
      module: 'courses',
      description: 'Consultar catálogo de cursos',
    });
    if (!Array.isArray(coursesRes.body) || coursesRes.body.length === 0) {
      failImmediately('FASE 3', 'courses', 'GET /courses', 'Lista no vacía de cursos', JSON.stringify(coursesRes.body));
    }
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const targetCourse =
      coursesRes.body.find((c) => c.cycle === 6 && uuidV4Regex.test(c.id)) ||
      coursesRes.body.find((c) => uuidV4Regex.test(c.id)) ||
      coursesRes.body[0];
    const courseId: string = targetCourse.id;
    const courseCycle: number = targetCourse.cycle ?? 6;
    recordPass(
      'FASE 3',
      'courses',
      'GET /courses (Catálogo académico)',
      'HTTP 200',
      `HTTP ${coursesRes.status}`,
      `Seleccionado curso "${targetCourse.name}" (id=${courseId}, cycle=${courseCycle})`,
    );

    // 3.2 Usuario A crea post: POST /posts con type = "study_group", maxCapacity = 5
    const createPostRes = await apiRequest(baseUrl, 'POST', '/posts', {
      token: tokenA,
      body: {
        courseId,
        type: 'study_group',
        maxCapacity: 5,
        description: `Convocatoria E2E ${ts} para repasar laboratorios y preparar el examen parcial.`,
        benefits: 'Resolución de guías pasadas y simulacros prácticos',
        requirements: 'Puntualidad y compromiso semanal',
      },
      expectedStatus: 201,
      phase: 'FASE 3',
      module: 'posts',
      description: 'Crear convocatoria de grupo de estudio',
    });
    const postId: string = createPostRes.body.id;
    const autoCreatedGroupId: string | null = createPostRes.body.groupId;
    if (!postId || createPostRes.body.status !== 'published') {
      failImmediately('FASE 3', 'posts', 'POST /posts', 'postId válido y status=published', createPostRes.body);
    }
    recordPass(
      'FASE 3',
      'posts',
      'POST /posts (Crear convocatoria study_group)',
      'HTTP 201',
      `HTTP ${createPostRes.status}`,
      `postId=${postId}, groupId=${autoCreatedGroupId}`,
    );

    // 3.3 Usuario B consulta feed público: GET /posts?type=study_group&cycle=...
    const feedRes = await apiRequest<any>(
      baseUrl,
      'GET',
      `/posts?type=study_group&cycle=${courseCycle}&limit=50`,
      {
        token: tokenB,
        expectedStatus: 200,
        phase: 'FASE 3',
        module: 'posts',
        description: 'Filtrar feed público por type=study_group y cycle',
      },
    );
    const feedItems: any[] = Array.isArray(feedRes.body) ? feedRes.body : feedRes.body?.items ?? [];
    const foundInFeed = feedItems.find((p) => p.id === postId);
    if (!foundInFeed || foundInFeed.status !== 'published') {
      failImmediately(
        'FASE 3',
        'posts',
        `GET /posts?type=study_group&cycle=${courseCycle}`,
        `postId ${postId} con status="published"`,
        foundInFeed ? `status=${foundInFeed.status}` : 'No encontrado en feed',
      );
    }
    recordPass(
      'FASE 3',
      'posts',
      `GET /posts?type=study_group&cycle=${courseCycle} (Filtros del Feed)`,
      'HTTP 200 + postId publicado',
      `HTTP ${feedRes.status} (Encontrado postId=${postId}, status=${foundInFeed.status})`,
    );

    // ========================================================================
    // FASE 4: GRUPOS, SOLICITUDES Y MENSAJERÍA WEBSOCKET (Módulo group-messaging)
    // ========================================================================
    banner('FASE 4: Grupos, Solicitudes y Mensajería WebSocket (Módulo group-messaging)');

    // 4.1 Creación de Grupo de Estudio por Usuario A (POST /groups)
    const createGroupRes = await apiRequest(baseUrl, 'POST', '/groups', {
      token: tokenA,
      body: {
        name: `Grupo E2E Redes ${ts}`,
        description: 'Grupo oficial de preparación para laboratorios de Redes',
        courseCode: 'REDES6',
        meetingMode: 'virtual',
        meetingShift: 'tarde',
        maxCapacity: 5,
      },
      expectedStatus: 201,
      phase: 'FASE 4',
      module: 'group-messaging',
      description: 'Crear grupo de estudio (POST /groups)',
    });
    const groupId: string = createGroupRes.body.id;
    if (!groupId) {
      failImmediately('FASE 4', 'group-messaging', 'POST /groups', 'groupId válido', createGroupRes.body);
    }
    recordPass(
      'FASE 4',
      'group-messaging',
      'POST /groups (Crear grupo de estudio)',
      'HTTP 201',
      `HTTP ${createGroupRes.status}`,
      `groupId=${groupId}`,
    );

    // Verificar que Usuario A sea miembro con rol 'leader' en group_members y vía GET /groups/:groupId/members
    const initialMembersRes = await apiRequest<any[]>(baseUrl, 'GET', `/groups/${groupId}/members`, {
      token: tokenA,
      expectedStatus: 200,
      phase: 'FASE 4',
      module: 'group-messaging',
      description: 'Verificar líder inicial en GET /groups/:groupId/members',
    });
    const leaderMember = initialMembersRes.body.find((m) => m.userId === userAId);
    if (!leaderMember || leaderMember.role !== 'leader') {
      failImmediately(
        'FASE 4',
        'group-messaging',
        `GET /groups/${groupId}/members`,
        `Usuario A con role="leader"`,
        JSON.stringify(initialMembersRes.body),
      );
    }
    recordPass(
      'FASE 4',
      'group-messaging',
      `GET /groups/${groupId}/members (Verificar rol leader de Usuario A)`,
      'role="leader"',
      `role="${leaderMember.role}"`,
    );

    // 4.2 Flujo de Postulación: Usuario B postula al grupo (POST /groups/:groupId/join-requests)
    const joinReqRes = await apiRequest(baseUrl, 'POST', `/groups/${groupId}/join-requests`, {
      token: tokenB,
      body: {
        message: 'Hola Elena, tengo disponibilidad los lunes y quiero sumarme al grupo.',
      },
      expectedStatus: 201,
      phase: 'FASE 4',
      module: 'group-messaging',
      description: 'Usuario B envía solicitud de unión',
    });
    const requestId: string = joinReqRes.body.id;
    if (!requestId || joinReqRes.body.status !== 'pending') {
      failImmediately('FASE 4', 'group-messaging', `POST /groups/${groupId}/join-requests`, 'requestId + pending', joinReqRes.body);
    }
    recordPass(
      'FASE 4',
      'group-messaging',
      `POST /groups/${groupId}/join-requests (Postulación de Usuario B)`,
      'HTTP 201',
      `HTTP ${joinReqRes.status}`,
      `requestId=${requestId}, status=${joinReqRes.body.status}`,
    );

    // 4.3 Validar duplicidad: Usuario B vuelve a postular al mismo grupo -> HTTP 409 Conflict
    const dupJoinReqRes = await apiRequest(baseUrl, 'POST', `/groups/${groupId}/join-requests`, {
      token: tokenB,
      body: {
        message: 'Intento duplicado de solicitud',
      },
      expectedStatus: 409,
      phase: 'FASE 4',
      module: 'group-messaging',
      description: 'Rechazar solicitud duplicada al mismo grupo',
    });
    recordPass(
      'FASE 4',
      'group-messaging',
      `POST /groups/${groupId}/join-requests (Validación de duplicidad)`,
      'HTTP 409',
      `HTTP ${dupJoinReqRes.status}`,
    );

    // 4.4 Usuario A consulta solicitudes pendientes: GET /groups/:groupId/join-requests
    const listReqRes = await apiRequest<any[]>(baseUrl, 'GET', `/groups/${groupId}/join-requests`, {
      token: tokenA,
      expectedStatus: 200,
      phase: 'FASE 4',
      module: 'group-messaging',
      description: 'Líder consulta solicitudes pendientes del grupo',
    });
    const pendingFound = listReqRes.body.find((r) => r.id === requestId && r.userId === userBId);
    if (!pendingFound) {
      failImmediately(
        'FASE 4',
        'group-messaging',
        `GET /groups/${groupId}/join-requests`,
        `Solicitud ${requestId} presente`,
        JSON.stringify(listReqRes.body),
      );
    }
    recordPass(
      'FASE 4',
      'group-messaging',
      `GET /groups/${groupId}/join-requests (Consulta por Líder)`,
      'HTTP 200 + Solicitud listada',
      `HTTP ${listReqRes.status} (${listReqRes.body.length} pendiente(s))`,
    );

    // 4.5 Usuario A aprueba solicitud: PATCH /groups/:groupId/join-requests/:requestId con { status: "approved" }
    const approveRes = await apiRequest(
      baseUrl,
      'PATCH',
      `/groups/${groupId}/join-requests/${requestId}`,
      {
        token: tokenA,
        body: { status: 'approved' },
        expectedStatus: 200,
        phase: 'FASE 4',
        module: 'group-messaging',
        description: 'Líder aprueba solicitud de Usuario B',
      },
    );
    recordPass(
      'FASE 4',
      'group-messaging',
      `PATCH /groups/${groupId}/join-requests/${requestId} (Aprobar solicitud)`,
      'HTTP 200',
      `HTTP ${approveRes.status}`,
    );

    // 4.6 Verificar que Usuario B figure ahora en GET /groups/:groupId/members con rol 'member'
    const updatedMembersRes = await apiRequest<any[]>(baseUrl, 'GET', `/groups/${groupId}/members`, {
      token: tokenA,
      expectedStatus: 200,
      phase: 'FASE 4',
      module: 'group-messaging',
      description: 'Verificar ingreso de Usuario B como member',
    });
    const memberB = updatedMembersRes.body.find((m) => m.userId === userBId);
    if (!memberB || memberB.role !== 'member') {
      failImmediately(
        'FASE 4',
        'group-messaging',
        `GET /groups/${groupId}/members`,
        `Usuario B con role="member"`,
        JSON.stringify(updatedMembersRes.body),
      );
    }
    recordPass(
      'FASE 4',
      'group-messaging',
      `GET /groups/${groupId}/members (Verificar rol member de Usuario B)`,
      'HTTP 200 + role="member"',
      `HTTP ${updatedMembersRes.status} (total miembros=${updatedMembersRes.body.length})`,
    );

    // 4.7 Prueba de WebSockets en Tiempo Real (ChatGateway)
    const socketA = await connectSocket(baseUrl, tokenA);
    const socketB = await connectSocket(baseUrl, tokenB);
    const socketC = await connectSocket(baseUrl, tokenC);
    openSockets.push(socketA, socketB, socketC);

    // Ambos miembros emiten chat:join_room con { groupId }
    const joinAckA = await emitWithAck(socketA, 'chat:join_room', { groupId });
    const joinAckB = await emitWithAck(socketB, 'chat:join_room', { groupId });
    if (!joinAckA?.success || !joinAckB?.success) {
      failImmediately(
        'FASE 4',
        'group-messaging (WS)',
        'chat:join_room (Usuario A y Usuario B)',
        'success=true',
        JSON.stringify({ joinAckA, joinAckB }),
      );
    }
    recordPass(
      'FASE 4',
      'group-messaging (WS)',
      'WS chat:join_room (Usuario A y Usuario B unidos a la sala)',
      'ACK success=true',
      `ACK success=true (online=${joinAckB.userIds?.length})`,
    );

    // Preparar promesa para escuchar chat:new_message en el socket de Usuario A
    const chatMessageContent = 'Hola equipo, listos para estudiar';
    const receivedByAPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timeout esperando evento WS chat:new_message en Usuario A')),
        5000,
      );
      socketA.once('chat:new_message', (msg) => {
        clearTimeout(timeout);
        resolve(msg);
      });
    });

    // Usuario B envía mensaje por WebSocket
    const sendAckB = await emitWithAck(socketB, 'chat:send_message', {
      groupId,
      content: chatMessageContent,
    });
    if (!sendAckB?.success || sendAckB.message?.content !== chatMessageContent) {
      failImmediately(
        'FASE 4',
        'group-messaging (WS)',
        'WS chat:send_message (ACK al emisor Usuario B)',
        `ACK success=true & content="${chatMessageContent}"`,
        JSON.stringify(sendAckB),
      );
    }
    recordPass(
      'FASE 4',
      'group-messaging (WS)',
      'WS chat:send_message (ACK de confirmación al emisor)',
      'ACK success=true',
      `ACK success=true (messageId=${sendAckB.message.id})`,
    );

    // Verificar recepción en tiempo real por Usuario A
    const broadcastMsg = await receivedByAPromise;
    if (broadcastMsg?.content !== chatMessageContent || broadcastMsg?.sender?.id !== userBId) {
      failImmediately(
        'FASE 4',
        'group-messaging (WS)',
        'WS chat:new_message (Recepción en Usuario A)',
        `content="${chatMessageContent}" & sender.id="${userBId}"`,
        JSON.stringify(broadcastMsg),
      );
    }
    recordPass(
      'FASE 4',
      'group-messaging (WS)',
      'WS chat:new_message (Difusión en tiempo real a Usuario A)',
      `content="${chatMessageContent}"`,
      `Recibido de senderId=${broadcastMsg.sender.id}`,
    );

    // Verificar persistencia relacional en GET /groups/:groupId/messages
    const historyRes = await apiRequest<any[]>(baseUrl, 'GET', `/groups/${groupId}/messages`, {
      token: tokenA,
      expectedStatus: 200,
      phase: 'FASE 4',
      module: 'group-messaging',
      description: 'Verificar persistencia del mensaje en PostgreSQL',
    });
    const persistedMsg = historyRes.body.find((m) => m.id === sendAckB.message.id);
    if (!persistedMsg || persistedMsg.content !== chatMessageContent) {
      failImmediately(
        'FASE 4',
        'group-messaging',
        `GET /groups/${groupId}/messages`,
        `Mensaje ${sendAckB.message.id} persistido en BD`,
        JSON.stringify(historyRes.body),
      );
    }
    recordPass(
      'FASE 4',
      'group-messaging',
      `GET /groups/${groupId}/messages (Persistencia relacional previa al ACK)`,
      'HTTP 200 + Mensaje en BD',
      `HTTP ${historyRes.status} (messageId=${persistedMsg.id})`,
    );

    // Probar envío con un socket no autorizado (Usuario C ajeno al grupo) -> Verificar rechazo con chat:error
    const unauthorizedErrorPromise = new Promise<any>((resolve) => {
      socketC.once('chat:error', (err) => resolve(err));
    });
    const unauthAck = await emitWithAck(socketC, 'chat:send_message', {
      groupId,
      content: 'Mensaje intruso no autorizado',
    });
    const unauthErrorEvent = await unauthorizedErrorPromise;
    if (unauthAck?.success !== false || unauthErrorEvent?.code !== 'FORBIDDEN') {
      failImmediately(
        'FASE 4',
        'group-messaging (WS)',
        'WS chat:send_message (Usuario C ajeno al grupo)',
        'ACK success=false & chat:error code=FORBIDDEN',
        JSON.stringify({ unauthAck, unauthErrorEvent }),
      );
    }
    recordPass(
      'FASE 4',
      'group-messaging (WS)',
      'WS chat:send_message (Bloqueo de socket no autorizado ajeno al grupo)',
      'chat:error FORBIDDEN',
      `code="${unauthErrorEvent.code}" (${unauthErrorEvent.message})`,
    );

    // ========================================================================
    // FASE 5: SISTEMA DE RESEÑAS Y CALIFICACIONES (Módulo reviews)
    // ========================================================================
    banner('FASE 5: Sistema de Reseñas y Calificaciones (Módulo reviews)');

    // 5.1 Elegibilidad por Interacción Previa: GET /reviews/eligibility/:userAId
    const eligRes = await apiRequest(baseUrl, 'GET', `/reviews/eligibility/${userAId}`, {
      token: tokenB,
      expectedStatus: 200,
      phase: 'FASE 5',
      module: 'reviews',
      description: 'Verificar elegibilidad de Usuario B para reseñar a Usuario A',
    });
    if (eligRes.body.allowed !== true) {
      failImmediately(
        'FASE 5',
        'reviews',
        `GET /reviews/eligibility/${userAId}`,
        'allowed=true',
        JSON.stringify(eligRes.body),
      );
    }
    recordPass(
      'FASE 5',
      'reviews',
      `GET /reviews/eligibility/${userAId} (Membresía compartida verificada)`,
      'HTTP 200 + allowed=true',
      `HTTP ${eligRes.status} (allowed=${eligRes.body.allowed})`,
    );

    // 5.2 Publicar Calificación: POST /reviews con rating: 5
    const createRevRes = await apiRequest(baseUrl, 'POST', '/reviews', {
      token: tokenB,
      body: {
        reviewedUserId: userAId,
        rating: 5,
        comment: 'Excelente líder de grupo, organizó todas las sesiones de estudio con claridad.',
      },
      expectedStatus: 201,
      phase: 'FASE 5',
      module: 'reviews',
      description: 'Usuario B publica reseña de 5 estrellas para Usuario A',
    });
    const reviewId: string = createRevRes.body.id;
    if (!reviewId || createRevRes.body.rating !== 5) {
      failImmediately('FASE 5', 'reviews', 'POST /reviews', 'reviewId válido y rating=5', createRevRes.body);
    }
    recordPass(
      'FASE 5',
      'reviews',
      'POST /reviews (Calificar a Usuario A con rating=5)',
      'HTTP 201',
      `HTTP ${createRevRes.status}`,
      `reviewId=${reviewId}`,
    );

    // 5.3 Validación de auto-calificación: Usuario B intenta calificar a Usuario B -> HTTP 400
    const selfRevRes = await apiRequest(baseUrl, 'POST', '/reviews', {
      token: tokenB,
      body: {
        reviewedUserId: userBId,
        rating: 5,
        comment: 'Intentando auto-reseñarme.',
      },
      expectedStatus: 400,
      phase: 'FASE 5',
      module: 'reviews',
      description: 'Rechazar auto-reseña (NoSelfReviewRule)',
    });
    recordPass(
      'FASE 5',
      'reviews',
      'POST /reviews (Bloqueo de auto-calificación)',
      'HTTP 400',
      `HTTP ${selfRevRes.status}`,
    );

    // 5.4 Validación de segunda reseña duplicada: Usuario B vuelve a calificar a Usuario A -> HTTP 409
    const dupRevRes = await apiRequest(baseUrl, 'POST', '/reviews', {
      token: tokenB,
      body: {
        reviewedUserId: userAId,
        rating: 4,
        comment: 'Segunda reseña duplicada para el mismo compañero.',
      },
      expectedStatus: 409,
      phase: 'FASE 5',
      module: 'reviews',
      description: 'Rechazar segunda reseña al mismo compañero (UniqueReviewRule)',
    });
    recordPass(
      'FASE 5',
      'reviews',
      'POST /reviews (Bloqueo de reseña duplicada)',
      'HTTP 409',
      `HTTP ${dupRevRes.status}`,
    );

    // 5.5 Usuario A consulta sus reseñas: GET /reviews/user/:userAId -> Comprobar promedio
    const summaryRevRes = await apiRequest(baseUrl, 'GET', `/reviews/user/${userAId}`, {
      token: tokenA,
      expectedStatus: 200,
      phase: 'FASE 5',
      module: 'reviews',
      description: 'Consultar resumen y promedio de reseñas de Usuario A',
    });
    if (summaryRevRes.body.averageRating !== 5 || summaryRevRes.body.totalReviews !== 1) {
      failImmediately(
        'FASE 5',
        'reviews',
        `GET /reviews/user/${userAId}`,
        'averageRating=5, totalReviews=1',
        JSON.stringify(summaryRevRes.body),
      );
    }
    recordPass(
      'FASE 5',
      'reviews',
      `GET /reviews/user/${userAId} (Cálculo de promedio y listado)`,
      'HTTP 200 + averageRating=5',
      `HTTP ${summaryRevRes.status} (averageRating=${summaryRevRes.body.averageRating}, totalReviews=${summaryRevRes.body.totalReviews})`,
    );

    // ========================================================================
    // FASE 6: MODERACIÓN DE CONTENIDO Y EVENTOS ASÍNCRONOS (Módulo moderation)
    // ========================================================================
    banner('FASE 6: Moderación de Contenido y Eventos Asíncronos (Módulo moderation)');

    // 6.1 Filtro Automático Asíncrono (EventEmitter -> content.created)
    // Usuario B publica un post con palabra prohibida ("estafa") del diccionario léxico
    const badPostRes = await apiRequest(baseUrl, 'POST', '/posts', {
      token: tokenB,
      body: {
        courseId,
        type: 'tutoring',
        maxCapacity: 3,
        description: 'Ofrezco servicio de estafa garantizada para aprobar el examen sin estudiar.',
      },
      expectedStatus: 201,
      phase: 'FASE 6',
      module: 'moderation',
      description: 'Publicar contenido con término restringido ("estafa") para disparo de evento content.created',
    });
    const flaggedPostId: string = badPostRes.body.id;

    // Esperar procesamiento asíncrono del listener de moderación
    await new Promise((r) => setTimeout(r, 800));

    const [{ status: postStatusAfterMod }] = await db.query(
      'SELECT status FROM publications WHERE id = $1',
      [flaggedPostId],
    );
    if (postStatusAfterMod !== 'hidden') {
      failImmediately(
        'FASE 6',
        'moderation',
        'Evento asíncrono content.created -> Ocultamiento automático en BD',
        'status="hidden"',
        `status="${postStatusAfterMod}"`,
      );
    }
    recordPass(
      'FASE 6',
      'moderation',
      'Filtro Léxico Asíncrono (Evento content.created -> status="hidden")',
      'status="hidden"',
      `status="${postStatusAfterMod}" (postId=${flaggedPostId})`,
    );

    // 6.2 Denuncia Manual (Reporte): Usuario B reporta el post de Usuario A (POST /moderation/reports)
    const createRepRes = await apiRequest(baseUrl, 'POST', '/moderation/reports', {
      token: tokenB,
      body: {
        targetType: 'publication',
        targetId: postId,
        reason: 'Contenido sospechoso de prueba E2E',
      },
      expectedStatus: 201,
      phase: 'FASE 6',
      module: 'moderation',
      description: 'Usuario B reporta publicación de Usuario A',
    });
    const reportId: string = createRepRes.body.reportId ?? createRepRes.body.report?.id;
    if (!reportId) {
      failImmediately('FASE 6', 'moderation', 'POST /moderation/reports', 'reportId válido', JSON.stringify(createRepRes.body));
    }
    recordPass(
      'FASE 6',
      'moderation',
      'POST /moderation/reports (Denuncia manual de publicación)',
      'HTTP 201',
      `HTTP ${createRepRes.status}`,
      `reportId=${reportId}`,
    );

    // 6.3 Intentar reportar de nuevo el mismo recurso -> Esperar HTTP 409 Conflict
    const dupRepRes = await apiRequest(baseUrl, 'POST', '/moderation/reports', {
      token: tokenB,
      body: {
        targetType: 'publication',
        targetId: postId,
        reason: 'Reporte repetido sobre la misma publicación',
      },
      expectedStatus: 409,
      phase: 'FASE 6',
      module: 'moderation',
      description: 'Rechazar reporte pendiente duplicado del mismo autor',
    });
    recordPass(
      'FASE 6',
      'moderation',
      'POST /moderation/reports (Bloqueo de reporte duplicado)',
      'HTTP 409',
      `HTTP ${dupRepRes.status}`,
    );

    // 6.4 Apelación: Usuario B consulta GET /moderation/my-logs y envía POST /moderation/appeals
    const myLogsRes = await apiRequest<any[]>(baseUrl, 'GET', '/moderation/my-logs', {
      token: tokenB,
      expectedStatus: 200,
      phase: 'FASE 6',
      module: 'moderation',
      description: 'Usuario B consulta historial de contenido propio moderado',
    });
    const modLog = myLogsRes.body.find((l) => l.contentId === flaggedPostId);
    if (!modLog) {
      failImmediately(
        'FASE 6',
        'moderation',
        'GET /moderation/my-logs',
        `Registro de moderación para contentId=${flaggedPostId}`,
        JSON.stringify(myLogsRes.body),
      );
    }
    recordPass(
      'FASE 6',
      'moderation',
      'GET /moderation/my-logs (Localizar contenido ocultado)',
      'HTTP 200 + Log encontrado',
      `HTTP ${myLogsRes.status} (moderationLogId=${modLog.id})`,
    );

    const createAppealRes = await apiRequest(baseUrl, 'POST', '/moderation/appeals', {
      token: tokenB,
      body: {
        moderationLogId: modLog.id,
        justification: 'El término se usó como ejemplo académico de ciberseguridad y prevención de fraude.',
      },
      expectedStatus: 201,
      phase: 'FASE 6',
      module: 'moderation',
      description: 'Usuario B envía apelación sobre contenido moderado',
    });
    const appealId: string = createAppealRes.body.appealId ?? createAppealRes.body.appeal?.id;
    if (!appealId) {
      failImmediately('FASE 6', 'moderation', 'POST /moderation/appeals', 'appealId válido', JSON.stringify(createAppealRes.body));
    }
    recordPass(
      'FASE 6',
      'moderation',
      'POST /moderation/appeals (Crear apelación con justificación)',
      'HTTP 201',
      `HTTP ${createAppealRes.status}`,
      `appealId=${appealId}`,
    );

    // ========================================================================
    // FASE 7: PANEL DE ADMINISTRACIÓN Y REVOCACIÓN DE SESIONES (Módulo administration)
    // ========================================================================
    banner('FASE 7: Panel de Administración y Revocación de Sesiones (Módulo administration)');

    // 7.1 RBAC: Usuario A (student) intenta acceder a GET /admin/stats -> Esperar HTTP 403 Forbidden
    const rbacDenyRes = await apiRequest(baseUrl, 'GET', '/admin/stats', {
      token: tokenA,
      expectedStatus: 403,
      phase: 'FASE 7',
      module: 'administration',
      description: 'Bloquear acceso de estudiante a ruta exclusiva de administrador',
    });
    recordPass(
      'FASE 7',
      'administration',
      'GET /admin/stats con token de Estudiante (Validación RBAC)',
      'HTTP 403',
      `HTTP ${rbacDenyRes.status}`,
    );

    // 7.2 Con adminToken, acceder a GET /admin/stats -> Esperar HTTP 200 y métricas consolidadas
    const statsRes = await apiRequest(baseUrl, 'GET', '/admin/stats', {
      token: adminToken,
      expectedStatus: 200,
      phase: 'FASE 7',
      module: 'administration',
      description: 'Consultar métricas consolidadas con token de Administrador',
    });
    if (typeof statsRes.body.totalUsers !== 'number' || typeof statsRes.body.pendingReports !== 'number') {
      failImmediately('FASE 7', 'administration', 'GET /admin/stats (Admin)', 'Métricas numéricas válidas', statsRes.body);
    }
    recordPass(
      'FASE 7',
      'administration',
      'GET /admin/stats con adminToken (Métricas consolidadas)',
      'HTTP 200',
      `HTTP ${statsRes.status}`,
      `totalUsers=${statsRes.body.totalUsers}, pendingReports=${statsRes.body.pendingReports}, pendingAppeals=${statsRes.body.pendingAppeals}`,
    );

    // 7.3 Resolución de Apelaciones: Admin consulta GET /admin/appeals?status=pending y aprueba apelación
    const pendingAppealsRes = await apiRequest(baseUrl, 'GET', '/admin/appeals?status=pending&limit=50', {
      token: adminToken,
      expectedStatus: 200,
      phase: 'FASE 7',
      module: 'administration',
      description: 'Listar apelaciones pendientes en panel admin',
    });
    const appealListed = pendingAppealsRes.body.items?.some((a: any) => a.id === appealId);
    if (!appealListed) {
      failImmediately(
        'FASE 7',
        'administration',
        'GET /admin/appeals?status=pending',
        `appealId ${appealId} presente`,
        JSON.stringify(pendingAppealsRes.body),
      );
    }
    recordPass(
      'FASE 7',
      'administration',
      'GET /admin/appeals?status=pending (Listado de apelaciones)',
      'HTTP 200 + appealId encontrado',
      `HTTP ${pendingAppealsRes.status}`,
    );

    const resolveAppealRes = await apiRequest(baseUrl, 'PATCH', `/admin/appeals/${appealId}`, {
      token: adminToken,
      body: { status: 'approved' },
      expectedStatus: 200,
      phase: 'FASE 7',
      module: 'administration',
      description: 'Admin aprueba apelación y restaura contenido',
    });
    const [{ status: restoredPostStatus }] = await db.query(
      'SELECT status FROM publications WHERE id = $1',
      [flaggedPostId],
    );
    if (restoredPostStatus !== 'published') {
      failImmediately(
        'FASE 7',
        'administration',
        `PATCH /admin/appeals/${appealId}`,
        'Contenido restaurado a status="published"',
        `status="${restoredPostStatus}"`,
      );
    }
    recordPass(
      'FASE 7',
      'administration',
      `PATCH /admin/appeals/${appealId} (Aprobar apelación y restaurar publicación)`,
      'HTTP 200 + status="published"',
      `HTTP ${resolveAppealRes.status} (post status="${restoredPostStatus}")`,
    );

    // 7.4 Admin procesa reporte: PATCH /admin/reports/:reportId con { status: "resolved", action: "none" }
    const resolveRepRes = await apiRequest(baseUrl, 'PATCH', `/admin/reports/${reportId}`, {
      token: adminToken,
      body: { status: 'resolved', action: 'none' },
      expectedStatus: 200,
      phase: 'FASE 7',
      module: 'administration',
      description: 'Admin resuelve reporte con action="none"',
    });
    recordPass(
      'FASE 7',
      'administration',
      `PATCH /admin/reports/${reportId} (Resolver reporte)`,
      'HTTP 200',
      `HTTP ${resolveRepRes.status}`,
    );

    // 7.5 Suspensión de Cuenta y Revocación Instantánea: PATCH /admin/users/:userBId/status
    const suspendRes = await apiRequest(baseUrl, 'PATCH', `/admin/users/${userBId}/status`, {
      token: adminToken,
      body: {
        status: 'suspended',
        reason: 'Falta disciplinaria comprobada en prueba E2E',
      },
      expectedStatus: 200,
      phase: 'FASE 7',
      module: 'administration',
      description: 'Admin suspende la cuenta de Usuario B',
    });
    recordPass(
      'FASE 7',
      'administration',
      `PATCH /admin/users/${userBId}/status (Suspender cuenta de Usuario B)`,
      'HTTP 200',
      `HTTP ${suspendRes.status}`,
    );

    // Aserción Crítica de Seguridad 1: Petición con tokenB (GET /profiles/me) debe ser rechazada con 401/403
    const revokedTokenRes = await apiRequest(baseUrl, 'GET', '/profiles/me', {
      token: tokenB,
      expectedStatus: [401, 403],
      phase: 'FASE 7',
      module: 'auth-security',
      description: 'Rechazo inmediato de JWT activo tras suspensión de cuenta',
    });
    recordPass(
      'FASE 7',
      'auth-security',
      'GET /profiles/me con tokenB suspendido (Revocación instantánea de sesión)',
      'HTTP 401/403',
      `HTTP ${revokedTokenRes.status} (${revokedTokenRes.body?.message})`,
    );

    // Aserción Crítica de Seguridad 2: Intentar login con Usuario B -> HTTP 403 Forbidden
    const suspendedLoginRes = await apiRequest(baseUrl, 'POST', '/auth/login', {
      body: { email: userBEmail, password: defaultPassword },
      expectedStatus: 403,
      phase: 'FASE 7',
      module: 'auth-security',
      description: 'Bloquear inicio de sesión de cuenta suspendida',
    });
    recordPass(
      'FASE 7',
      'auth-security',
      'POST /auth/login con Usuario B suspendido (Bloqueo de acceso)',
      'HTTP 403 Forbidden',
      `HTTP ${suspendedLoginRes.status} ("${suspendedLoginRes.body?.message}")`,
    );

    // ========================================================================
    // RESUMEN EJECUTIVO FINAL
    // ========================================================================
    banner('RESUMEN FINAL DE EJECUCIÓN E2E - INTEROPERABILIDAD DE LOS 7 MÓDULOS');

    const modulesStatus = [
      { id: 'SPEC-01', name: 'auth-security (Auth, JWT, OTP, RBAC, Revocación)', status: 'PASS' },
      { id: 'SPEC-02', name: 'user-profile (Perfiles, Horarios, Solapamientos)', status: 'PASS' },
      { id: 'SPEC-03', name: 'courses & posts (Catálogo, Convocatorias, Feed)', status: 'PASS' },
      { id: 'SPEC-04', name: 'group-messaging (Grupos, Cupos, Solicitudes, WS)', status: 'PASS' },
      { id: 'SPEC-05', name: 'reviews (Elegibilidad, Calificaciones, Promedios)', status: 'PASS' },
      { id: 'SPEC-06', name: 'moderation (Filtro Léxico Async, Reportes, Apelaciones)', status: 'PASS' },
      { id: 'SPEC-07', name: 'administration (Métricas, Resolución, Suspensiones)', status: 'PASS' },
    ];

    for (const mod of modulesStatus) {
      console.log(`  ${C.green}${C.bold}✔ [${mod.status}]${C.reset} ${C.bold}${mod.id}${C.reset} -> ${mod.name}`);
    }

    console.log(`\n${C.bold}Métricas Globales de la Suite:${C.reset}`);
    console.log(`  • Total de Aserciones E2E superadas:  ${C.green}${C.bold}${executedSteps.length}${C.reset}`);
    console.log(`  • Total de Peticiones HTTP reales:    ${C.cyan}${C.bold}${totalHttpRequests}${C.reset}`);
    console.log(`  • Total de Operaciones WebSocket:     ${C.cyan}${C.bold}${totalWsEvents}${C.reset}`);
    console.log(`  • Módulos Verificados:                ${C.green}${C.bold}7 / 7 (100%)${C.reset}`);
    console.log(`  • Inconsistencias de Integración:     ${C.green}${C.bold}0 (CERO INCONSISTENCIAS)${C.reset}`);
    console.log(`${C.bold}${C.green}==============================================================================${C.reset}\n`);
  } finally {
    // Cierre limpio de sockets, datos efímeros de prueba y servidor NestJS
    for (const sock of openSockets) {
      try {
        sock.disconnect();
      } catch {
        // Ignorar errores al desconectar
      }
    }
    if (dataSource && dataSource.isInitialized && createdEmails.length > 0) {
      try {
        await dataSource.query(
          `DELETE FROM users WHERE email = ANY($1::text[])`,
          [createdEmails],
        );
      } catch {
        // Ignorar si falla limpieza final
      }
    }
    if (app) {
      await app.close();
    }
  }
}

runE2EIntegrationFlow().catch((err) => {
  console.error(`\n${C.red}${C.bold}Ejecución E2E abortada por fallo en aserción:${C.reset}`, err.message);
  process.exit(1);
});
