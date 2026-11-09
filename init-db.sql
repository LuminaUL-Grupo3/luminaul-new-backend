-- ============================================================
-- SCRIPT DE INICIALIZACIÓN DE BASE DE DATOS PARA LUMINAUL
-- Conforme a SPECS.md v3.0.0 y AGENTS.md (Protocolo de Desarrollo)
-- ============================================================

-- 0. Extensiones Requeridas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Limpieza limpia para inicialización
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS appeals CASCADE;
DROP TABLE IF EXISTS moderation_tasks CASCADE;
DROP TABLE IF EXISTS moderation_logs CASCADE;
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS banned_words CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS group_read_markers CASCADE;
DROP TABLE IF EXISTS group_messages CASCADE;
DROP TABLE IF EXISTS join_requests CASCADE;
DROP TABLE IF EXISTS group_members CASCADE;
DROP TABLE IF EXISTS publications CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS availabilities CASCADE;
DROP TABLE IF EXISTS profile_interests CASCADE;
DROP TABLE IF EXISTS profile_skills CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS revoked_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- 1. SPEC-01: Autenticación, Seguridad y RBAC
-- ============================================================

CREATE TABLE users (
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

CREATE INDEX ix_users_status ON users (status);
CREATE INDEX ix_users_role_status ON users (role, status) WHERE deleted_at IS NULL;

CREATE TABLE revoked_tokens (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_revoked_tokens_expires_at ON revoked_tokens (expires_at);
CREATE INDEX ix_revoked_tokens_user ON revoked_tokens (user_id);

-- ============================================================
-- 2. SPEC-02: Perfil de Alumno y Horarios
-- ============================================================

CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  bio TEXT,
  major VARCHAR(100),
  academic_cycle VARCHAR(20),
  profile_photo_url VARCHAR(255),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profile_skills (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name VARCHAR(50) NOT NULL,
  PRIMARY KEY (user_id, skill_name)
);

CREATE TABLE profile_interests (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interest_name VARCHAR(50) NOT NULL,
  PRIMARY KEY (user_id, interest_name)
);

CREATE TABLE availabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week VARCHAR(20) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_availabilities_user_day ON availabilities (user_id, day_of_week);

-- ============================================================
-- 3. SPEC-03: Cursos y Publicaciones
-- ============================================================

CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  cycle INTEGER
);

CREATE INDEX ix_courses_name ON courses (name);
CREATE INDEX ix_courses_cycle ON courses (cycle);

-- ============================================================
-- 4. SPEC-04: Grupos de Estudio y Chat en Tiempo Real
-- ============================================================

CREATE TABLE groups (
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

CREATE INDEX ix_groups_leader ON groups (leader_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_groups_course ON groups (course_code) WHERE deleted_at IS NULL;
CREATE INDEX ix_groups_active ON groups (created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE publications (
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

CREATE INDEX ix_publications_user ON publications (user_id);
CREATE INDEX ix_publications_course ON publications (course_id);
CREATE INDEX ix_publications_group ON publications (group_id) WHERE group_id IS NOT NULL;
CREATE INDEX ix_publications_feed_active ON publications (created_at DESC) WHERE deleted_at IS NULL AND status = 'published';
CREATE INDEX ix_publications_course_type ON publications (course_id, type, created_at DESC) WHERE deleted_at IS NULL AND status = 'published';
CREATE INDEX ix_publications_unmoderated ON publications (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_posts_feed ON publications (status, deleted_at, created_at);

CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMPTZ,
  CONSTRAINT uq_group_user UNIQUE (group_id, user_id)
);

CREATE INDEX ix_group_members_history ON group_members (group_id, user_id, status);
CREATE INDEX ix_group_members_user_status ON group_members (user_id, status);

CREATE TABLE join_requests (
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

CREATE UNIQUE INDEX ux_join_requests_pending ON join_requests (group_id, user_id) WHERE status = 'pending';
CREATE INDEX idx_join_requests_group_status ON join_requests (group_id, status);
CREATE INDEX ix_join_requests_user ON join_requests (user_id, status);

CREATE TABLE group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  client_message_id UUID,
  reply_to_id UUID REFERENCES group_messages(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX ix_group_messages_room ON group_messages (group_id, created_at);
CREATE INDEX ix_group_messages_room_active ON group_messages (group_id, created_at DESC) WHERE deleted_at IS NULL AND status = 'published';
CREATE INDEX ix_group_messages_unmoderated ON group_messages (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_group_messages_sender ON group_messages (sender_id);
CREATE UNIQUE INDEX ux_group_messages_retry ON group_messages (group_id, sender_id, client_message_id) WHERE client_message_id IS NOT NULL;
CREATE INDEX ix_group_messages_page ON group_messages (group_id, created_at DESC, id DESC);

CREATE TABLE message_reactions (
  message_id UUID NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL CHECK(emoji IN ('❤️','😂','👍','🔥')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE group_read_markers (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_id UUID NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  last_created_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- ============================================================
-- 5. SPEC-05: Reseñas y Calificaciones
-- ============================================================

CREATE TABLE reviews (
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

CREATE INDEX ix_reviews_reviewed_user ON reviews (reviewed_user_id);
CREATE INDEX ix_reviews_reviewer ON reviews (reviewer_id);
CREATE INDEX ix_reviews_rating_calc ON reviews (reviewed_user_id, rating) WHERE deleted_at IS NULL AND status = 'published';
CREATE INDEX ix_reviews_unmoderated ON reviews (created_at DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_active_review ON reviews (reviewer_id, reviewed_user_id) WHERE deleted_at IS NULL;

-- ============================================================
-- 6. SPEC-06: Moderación y Denuncias (Desacoplado)
-- ============================================================

CREATE TABLE banned_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word VARCHAR(50) UNIQUE NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'high'
);

CREATE TABLE moderation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(20) NOT NULL,
  content_id UUID NOT NULL,
  content_version INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(100),
  lock_token UUID,
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

CREATE INDEX ix_moderation_tasks_claim 
  ON moderation_tasks (created_at ASC, available_at) 
  WHERE status IN ('pending', 'retry');

CREATE UNIQUE INDEX uq_moderation_tasks_content 
  ON moderation_tasks (content_type, content_id, content_version);

CREATE INDEX ix_moderation_tasks_content_id 
  ON moderation_tasks (content_id);

CREATE INDEX ix_moderation_tasks_status 
  ON moderation_tasks (status);

CREATE INDEX ix_moderation_tasks_stale 
  ON moderation_tasks (lease_expires_at) 
  WHERE status = 'processing';

CREATE TABLE moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_task_id UUID REFERENCES moderation_tasks(id),
  content_type VARCHAR(20) NOT NULL,
  content_id UUID NOT NULL,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  detected_words TEXT[] NOT NULL,
  result VARCHAR(20) NOT NULL DEFAULT 'blocked',
  lexical_result VARCHAR(20) NOT NULL DEFAULT 'NOT_EVALUATED',
  semantic_status VARCHAR(30) NOT NULL DEFAULT 'NOT_EVALUATED',
  moderation_decision VARCHAR(20) NOT NULL DEFAULT 'PENDING_REVIEW',
  moderated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_moderation_logs_task ON moderation_logs (moderation_task_id);
CREATE INDEX ix_moderation_logs_author ON moderation_logs (author_id, moderated_at DESC);
CREATE INDEX ix_moderation_logs_content ON moderation_logs (content_type, content_id);
CREATE INDEX ix_moderation_logs_content_id ON moderation_logs (content_id);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL,
  target_id UUID NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_reporter_target ON reports (reporter_id, target_type, target_id) WHERE status = 'pending';
CREATE INDEX ix_reports_status ON reports (status);
CREATE INDEX ix_reports_reporter ON reports (reporter_id, created_at DESC);
CREATE INDEX ix_reports_target ON reports (target_type, target_id);

CREATE TABLE appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_log_id UUID NOT NULL REFERENCES moderation_logs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  justification TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_appeals_one_per_log ON appeals (moderation_log_id);
CREATE INDEX ix_appeals_user ON appeals (user_id);
CREATE INDEX ix_appeals_pending ON appeals (created_at ASC) WHERE status = 'pending';

-- ============================================================
-- 7. SPEC-07: Administración y Notificaciones
-- ============================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'SYSTEM',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_notifications_user ON notifications (user_id, is_read);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  target_entity VARCHAR(50) NOT NULL,
  target_id UUID NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX ix_audit_logs_admin ON audit_logs (admin_id);
CREATE INDEX ix_audit_logs_target ON audit_logs (target_entity, target_id);

-- ============================================================
-- 8. SEMILLAS (SEEDS) Y GOLDEN MOCKS OFICIALES
-- ============================================================

-- A. Usuarios Golden según SPECS.md (2 Alumnos y 2 Administradores)
-- Hash Bcrypt para 'PasswordSegura2026!':
-- $2b$10$FIYIvMY.n1KBFCOZPUX80OfDtX95lk6p0rVw/cIXvp7g.RYFf5u7e

INSERT INTO users (id, email, password_hash, name, role, status, is_verified, created_at, updated_at)
VALUES 
  ('d290f1ee-6c54-4b01-90e6-d701748f0851', '20210001@aloe.ulima.edu.pe', '$2b$10$FIYIvMY.n1KBFCOZPUX80OfDtX95lk6p0rVw/cIXvp7g.RYFf5u7e', 'Martín Vizcarra', 'student', 'active', true, NOW(), NOW()),
  ('a1b2c3d4-e5f6-47a8-b9c0-123456789abc', '20210002@aloe.ulima.edu.pe', '$2b$10$FIYIvMY.n1KBFCOZPUX80OfDtX95lk6p0rVw/cIXvp7g.RYFf5u7e', 'Carlos Mendoza', 'student', 'active', true, NOW(), NOW()),
  ('99887766-5544-4322-8100-aabbccddeeff', 'admin@aloe.ulima.edu.pe', '$2b$10$FIYIvMY.n1KBFCOZPUX80OfDtX95lk6p0rVw/cIXvp7g.RYFf5u7e', 'Administrador General', 'admin', 'active', true, NOW(), NOW()),
  ('00000099-0000-4000-8000-000000000099', 'admin2@aloe.ulima.edu.pe', '$2b$10$FIYIvMY.n1KBFCOZPUX80OfDtX95lk6p0rVw/cIXvp7g.RYFf5u7e', 'Administrador Secundario', 'admin', 'active', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- B. Perfiles Demo
INSERT INTO profiles (user_id, name, bio, major, academic_cycle, profile_photo_url, updated_at)
VALUES 
  ('d290f1ee-6c54-4b01-90e6-d701748f0851', 'Martín Vizcarra', 'Estudiante de 5to ciclo de Ing. de Sistemas', 'Ingeniería de Sistemas', '5', 'https://avatar.test/martin.png', NOW()),
  ('a1b2c3d4-e5f6-47a8-b9c0-123456789abc', 'Carlos Mendoza', 'Estudiante de 4to ciclo enfocado en algoritmos y estructuras de datos', 'Ingeniería de Sistemas', '4', 'https://avatar.test/carlos.png', NOW()),
  ('99887766-5544-4322-8100-aabbccddeeff', 'Administrador General', 'Gestión de Comunidad y Moderación LuminaUL', 'Administración', '10', 'https://avatar.test/admin.png', NOW()),
  ('00000099-0000-4000-8000-000000000099', 'Administrador Secundario', 'Gestión de Soporte y Operaciones LuminaUL', 'Administración', '10', 'https://avatar.test/admin2.png', NOW())
ON CONFLICT (user_id) DO NOTHING;

-- C. Habilidades e Intereses
INSERT INTO profile_skills (user_id, skill_name)
VALUES 
  ('d290f1ee-6c54-4b01-90e6-d701748f0851', 'TypeScript'),
  ('d290f1ee-6c54-4b01-90e6-d701748f0851', 'NestJS'),
  ('a1b2c3d4-e5f6-47a8-b9c0-123456789abc', 'Java'),
  ('a1b2c3d4-e5f6-47a8-b9c0-123456789abc', 'Algoritmos')
ON CONFLICT (user_id, skill_name) DO NOTHING;

INSERT INTO profile_interests (user_id, interest_name)
VALUES 
  ('d290f1ee-6c54-4b01-90e6-d701748f0851', 'Desarrollo Web'),
  ('d290f1ee-6c54-4b01-90e6-d701748f0851', 'Arquitectura de Software'),
  ('a1b2c3d4-e5f6-47a8-b9c0-123456789abc', 'Cálculo Avanzado')
ON CONFLICT (user_id, interest_name) DO NOTHING;

-- D. Catálogo de Palabras Prohibidas (Banned Words)
INSERT INTO banned_words (id, word, severity)
VALUES 
  -- 1. Fraude Académico y Faltas Disciplinarias (High)
  (gen_random_uuid(), 'estafa', 'high'),
  (gen_random_uuid(), 'plagio', 'high'),
  (gen_random_uuid(), 'fraude', 'high'),
  (gen_random_uuid(), 'compra_notas', 'high'),
  (gen_random_uuid(), 'venta_examenes', 'high'),
  (gen_random_uuid(), 'suplantacion', 'high'),
  (gen_random_uuid(), 'filtrar_examen', 'high'),
  (gen_random_uuid(), 'soborno', 'high'),
  (gen_random_uuid(), 'hackear_sistema', 'high'),

  -- 2. Amenazas Graves, Violencia y Daño Físico (High)
  (gen_random_uuid(), 'asesinato', 'high'),
  (gen_random_uuid(), 'sicario', 'high'),
  (gen_random_uuid(), 'matar', 'high'),
  (gen_random_uuid(), 'acuchillar', 'high'),
  (gen_random_uuid(), 'secuestro', 'high'),
  (gen_random_uuid(), 'violacion', 'high'),
  (gen_random_uuid(), 'violar', 'high'),
  (gen_random_uuid(), 'bomba', 'high'),
  (gen_random_uuid(), 'terrorismo', 'high'),
  (gen_random_uuid(), 'atentado', 'high'),

  -- 3. Autolesiones y Suicidio (High)
  (gen_random_uuid(), 'suicidio', 'high'),
  (gen_random_uuid(), 'suicidate', 'high'),
  (gen_random_uuid(), 'matate', 'high'),

  -- 4. Sustancias Ilícitas y Contenido Ilegal (High)
  (gen_random_uuid(), 'cocaina', 'high'),
  (gen_random_uuid(), 'marihuana', 'high'),
  (gen_random_uuid(), 'drogas', 'high'),
  (gen_random_uuid(), 'clonazepam', 'high'),
  (gen_random_uuid(), 'pedofilia', 'high'),
  (gen_random_uuid(), 'pornografia', 'high'),

  -- 5. Discurso de Odio, Discriminación y Agresiones Graves (High)
  (gen_random_uuid(), 'conchatumadre', 'high'),
  (gen_random_uuid(), 'concha_de_tu_madre', 'high'),
  (gen_random_uuid(), 'hijo_de_puta', 'high'),
  (gen_random_uuid(), 'hija_de_puta', 'high'),
  (gen_random_uuid(), 'serrano_de_mierda', 'high'),
  (gen_random_uuid(), 'cholo_de_mierda', 'high'),
  (gen_random_uuid(), 'negro_de_mierda', 'high'),
  (gen_random_uuid(), 'maricon', 'high'),
  (gen_random_uuid(), 'cabro_de_mierda', 'high'),

  -- 6. Hostigamiento, Ofensas y Spam (Medium / Low)
  (gen_random_uuid(), 'spam', 'medium'),
  (gen_random_uuid(), 'insulto', 'medium'),
  (gen_random_uuid(), 'puta', 'medium'),
  (gen_random_uuid(), 'mierda', 'medium'),
  (gen_random_uuid(), 'malparido', 'medium'),
  (gen_random_uuid(), 'imbecil', 'medium'),
  (gen_random_uuid(), 'estupido', 'medium'),
  (gen_random_uuid(), 'idiota', 'medium'),
  (gen_random_uuid(), 'retrasado', 'medium'),
  (gen_random_uuid(), 'golpear', 'medium'),
  (gen_random_uuid(), 'agredir', 'medium'),
  (gen_random_uuid(), 'amenaza', 'medium'),
  (gen_random_uuid(), 'maldito', 'low'),
  (gen_random_uuid(), 'asqueroso', 'low'),
  (gen_random_uuid(), 'basura', 'low')
ON CONFLICT (word) DO NOTHING;

-- E. Catálogo de Cursos de la Universidad de Lima (52 cursos oficiales)
INSERT INTO courses (id, name, cycle)
VALUES 
  ('128a50b4-62a7-4a37-ac0f-65f00bec9710', 'ÉTICA CIUDADANA', 1),
  ('bb923346-483b-4fd6-a3dd-605f229af0c5', 'INTRODUCCIÓN A LA INGENIERÍA', 1),
  ('8b8b9d22-4156-4554-a774-48797c3de258', 'LENGUAJE Y COMUNICACIÓN I', 1),
  ('291ab1cc-e9c0-43de-a945-6422841ab2c7', 'METODOLOGÍAS DE INVESTIGACIÓN', 1),
  ('1332850d-8268-4b5d-a083-5f144a549abf', 'PRECÁLCULO', 1),
  ('79566341-ad47-4a83-a855-182b1ac3a158', 'PROCESOS PSICOLÓGICOS', 1),
  ('027fae86-b843-47e4-ae72-eb5e0cb74013', 'ALGEBRA LINEAL', 2),
  ('8a62aa02-2bb9-492a-a053-97aac78b326a', 'CÁLCULO I', 2),
  ('54ef5723-93fb-4b80-a5f4-7d311432fd2d', 'FILOSOFÍA APLICADA', 2),
  ('dc115c89-4970-4898-a20f-2a0ca622678f', 'FUNDAMENTOS DE ECONOMÍA', 2),
  ('0a329503-4e05-4ec4-ada0-083927c78f1a', 'INTRODUCCIÓN AL COMERCIO INTERNACIONAL', 2),
  ('00eb342b-f8a2-4187-a49f-34cfa77641d1', 'LENGUAJE Y COMUNICACIÓN II', 2),
  ('f3706dc4-b289-490c-ae28-463f434c1f9d', 'CÁLCULO II', 3),
  ('255c2736-4f9b-4420-ab47-f60e1e878ac8', 'ESTRUCTURAS DISCRETAS DE COMPUTACIÓN', 3),
  ('bb688b05-90a4-4ce6-a4d8-a943a883e57a', 'FÍSICA PARA SISTEMAS', 3),
  ('ab89ec16-abeb-43cc-a89e-58cc8771fcdc', 'INTELIGENCIA ARTIFICIAL APLICADA', 3),
  ('48e42d93-27c9-400b-a8b3-560a1d621ca9', 'INTRODUCCIÓN A LA PROGRAMACIÓN', 3),
  ('2fb1cbf6-276a-4435-a4d4-ce8c218ec1a5', 'SISTEMAS ORGANIZACIONALES / ORGANIZATIONAL SYSTEMS', 3),
  ('d7a5e903-2d97-4598-a51e-34daa533f787', 'ARQUITECTURA DE COMPUTADORAS', 4),
  ('96dbff28-39a7-4b4d-ab6f-921c3fad9ebe', 'CÁLCULO III', 4),
  ('f94bff6f-b75c-4cd4-ab69-8c1031d5bafa', 'COSTEO DE OPERACIONES', 4),
  ('8c145a0b-e747-4a5b-ad7e-9a67393ed48f', 'ESTADÍSTICA Y PROBABILIDAD', 4),
  ('9aabf2ce-b316-4349-a0ac-6081c7ff9279', 'MODELACIÓN E INTEGRACIÓN DE SISTEMAS', 4),
  ('fc9d0871-a8da-4450-ac2b-79d97eeb83a6', 'PROGRAMACIÓN ORIENTADA A OBJETOS', 4),
  ('745ea97d-1948-4730-ad2c-dad0f39fc11d', 'DESARROLLO DE COMPETENCIAS GERENCIALES', 5),
  ('d4659eea-282b-471f-a782-ec66a1672d76', 'ESTADÍSTICA APLICADA', 5),
  ('9696d45e-ee1d-454f-a455-c97b4246af87', 'ESTRUCTURAS DE DATOS I', 5),
  ('b8daf6b9-0b5a-4026-a8b0-84e02dd4656e', 'INVESTIGACIÓN DE OPERACIONES I', 5),
  ('ded7abed-17a3-4054-a29c-0f08314ed4b0', 'MODELAMIENTO DE BASE DE DATOS', 5),
  ('79d455ce-a5cd-4784-af33-6f164a81c188', 'SISTEMAS OPERATIVOS', 5),
  ('f14c8c77-97ca-4238-a93b-8b04d375fc5c', 'ESTRUCTURAS DE DATOS II', 6),
  ('7b261f5b-74f6-4d6d-ac43-2c2cbf02975f', 'GESTIÓN FINANCIERA', 6),
  ('67ffa334-a278-401b-addb-c29cc9552ee2', 'INGENIERÍA DE PROCESOS DE NEGOCIO', 6),
  ('c51838fd-9ae6-46cb-a07e-561c0e8a0f2b', 'PROGRAMACIÓN WEB', 6),
  ('2848ae55-40ea-4da8-af04-e02d584fd455', 'REDES DE COMPUTADORAS', 6),
  ('a3b01192-120c-4eb7-a103-dc027589524c', 'SIMULACIÓN', 6),
  ('9b784e01-60c9-44ee-a9c6-4db8bf6cfbd7', 'APRENDIZAJE DE MÁQUINA / MACHINE LEARNING', 7),
  ('4cba961f-521a-4efa-a3da-90117b865942', 'CIBERSEGURIDAD / CYBERSECURITY', 7),
  ('7c32cd0b-86dc-4110-aaa1-f63ba3c447dd', 'GESTIÓN DE OPERACIONES', 7),
  ('8c537243-ea7d-411a-8bb7-fce5230bfdf2', 'INGENIERÍA DE SOFTWARE I', 7),
  ('6b979525-f1a6-4cb7-aac9-ea7de096e63e', 'SISTEMAS DE INTELIGENCIA EMPRESARIAL', 7),
  ('e4217604-382c-42c7-a1da-07f7fb24cd66', 'AUDITORÍA Y CONTROL DE SISTEMAS', 8),
  ('bd94211e-8c78-484e-a6be-c7ad38f08556', 'INGENIERÍA DE SOFTWARE II', 8),
  ('2192dce5-875d-4e09-a37e-6c0b4ea8093e', 'PROPUESTA DE INVESTIGACIÓN', 8),
  ('6a136a12-0649-49f6-a0bb-68bddaade625', 'SISTEMAS ERP', 8),
  ('d92008e3-e877-4393-a3d1-98dc0719830b', 'GESTIÓN DE PROYECTOS', 9),
  ('1deb7ec9-b743-48f9-a53f-5a143251cce6', 'PLANEAMIENTO ESTRATÉGICO', 9),
  ('d04d544b-a9d3-4904-aaa1-51b2e6b0f399', 'SEGURIDAD DE SISTEMAS', 9),
  ('a40a7b4b-118b-4d70-ac88-f9e3a9d94c16', 'SEMINARIO DE INVESTIGACIÓN I', 9),
  ('8aaa2fa1-10c9-41a0-aece-6d19063268eb', 'GESTIÓN DE SERVICIOS DIGITALES', 10),
  ('21269364-0d4b-4721-a6f3-d3d8c718df83', 'PROYECTO INTEGRADOR DE SISTEMAS', 10),
  ('57cceb05-ff93-44d5-abab-a7e8285edd3e', 'SEMINARIO DE INVESTIGACIÓN II', 10)
ON CONFLICT (name) DO NOTHING;

-- F. Grupo de Estudio Demo
INSERT INTO groups (id, name, description, benefits, requirements, course_code, leader_id, meeting_mode, meeting_shift, max_capacity, created_at)
VALUES (
  '7b134111-9a22-48df-9fa0-cd8213aa0981',
  'Grupo de Cálculo Integral Avanzado',
  'Repaso de integrales dobles y triples',
  'Exámenes resueltos y asesorías',
  'Haber aprobado Cálculo I',
  'CS101',
  'd290f1ee-6c54-4b01-90e6-d701748f0851',
  'virtual',
  'tarde',
  6,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- G. Membresías en Grupo (Roles estrictos 'leader' y 'member' de AGENTS.md)
INSERT INTO group_members (id, group_id, user_id, role, status, joined_at)
VALUES 
  (gen_random_uuid(), '7b134111-9a22-48df-9fa0-cd8213aa0981', 'd290f1ee-6c54-4b01-90e6-d701748f0851', 'leader', 'active', NOW()),
  (gen_random_uuid(), '7b134111-9a22-48df-9fa0-cd8213aa0981', 'a1b2c3d4-e5f6-47a8-b9c0-123456789abc', 'member', 'active', NOW())
ON CONFLICT (group_id, user_id) DO NOTHING;

-- H. Publicación Demo (asociada al curso y grupo)
INSERT INTO publications (id, user_id, group_id, course_id, type, description, benefits, requirements, max_capacity, status, created_at, updated_at)
VALUES (
  '18938a12-6f2b-4d43-9801-bca908234fed',
  'd290f1ee-6c54-4b01-90e6-d701748f0851',
  '7b134111-9a22-48df-9fa0-cd8213aa0981',
  '8c537243-ea7d-411a-8bb7-fce5230bfdf2',
  'study_group',
  'Buscamos 2 personas para repasar antes de la PC1 en biblioteca.',
  'Material de estudio y exámenes pasados',
  'Ganas de aprender y colaborar',
  5,
  'published',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- I. Mensaje Grupal de Prueba
INSERT INTO group_messages (id, group_id, sender_id, content, status, created_at)
VALUES (
  'f8a91012-3456-4890-a1cd-ef0123456789',
  '7b134111-9a22-48df-9fa0-cd8213aa0981',
  'd290f1ee-6c54-4b01-90e6-d701748f0851',
  '¡Bienvenidos al grupo de estudio oficial de LuminaUL!',
  'published',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- J. Reseña de Prueba (Carlos califica a Martín tras coincidir en grupo)
INSERT INTO reviews (id, reviewer_id, reviewed_user_id, rating, comment, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'a1b2c3d4-e5f6-47a8-b9c0-123456789abc',
  'd290f1ee-6c54-4b01-90e6-d701748f0851',
  5,
  'Excelente compañero de estudio, muy responsable y claro explicando temas complejos.',
  'published',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- K. Reporte y Moderación Desacoplada (SPEC-06)
INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at)
VALUES (
  'd5a19022-77aa-4899-b1c2-349801289fed',
  'a1b2c3d4-e5f6-47a8-b9c0-123456789abc',
  'publication',
  '18938a12-6f2b-4d43-9801-bca908234fed',
  'Contenido potencialmente duplicado o spam',
  'pending',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO moderation_logs (id, content_type, content_id, author_id, detected_words, result, moderated_at)
VALUES (
  'e6a21033-88bb-4900-a2d3-450912390abc',
  'publication',
  '18938a12-6f2b-4d43-9801-bca908234fed',
  'd290f1ee-6c54-4b01-90e6-d701748f0851',
  ARRAY['spam'],
  'blocked',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO appeals (id, moderation_log_id, user_id, justification, status, created_at)
VALUES (
  'f7b32144-99cc-4011-b3e4-561023401bcd',
  'e6a21033-88bb-4900-a2d3-450912390abc',
  'd290f1ee-6c54-4b01-90e6-d701748f0851',
  'La publicación fue realizada para coordinar el grupo de estudio y no infringe normas comunitarias.',
  'pending',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- L. Notificación de Muestra (SPEC-07)
INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
VALUES (
  gen_random_uuid(),
  'd290f1ee-6c54-4b01-90e6-d701748f0851',
  'Bienvenido a LuminaUL',
  'Tu cuenta institucional ha sido verificada. Ya puedes unirte y crear grupos de estudio.',
  'SYSTEM',
  false,
  NOW()
)
ON CONFLICT DO NOTHING;

-- M. Auditoría de Muestra (SPEC-07)
INSERT INTO audit_logs (id, admin_id, action, target_entity, target_id, details, created_at)
VALUES (
  gen_random_uuid(),
  '99887766-5544-4322-8100-aabbccddeeff',
  'SEED_INITIALIZATION',
  'system',
  '00000000-0000-4000-8000-000000000000',
  '{"version": "3.0.0", "environment": "development"}'::jsonb,
  NOW()
)
ON CONFLICT DO NOTHING;
