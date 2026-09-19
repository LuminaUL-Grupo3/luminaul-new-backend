-- ============================================================
-- SCRIPT DE INICIALIZACIÓN DE BASE DE DATOS PARA LUMINAUL
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de cursos
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  cycle INTEGER
);

-- 2. Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'student',
  status VARCHAR(50) NOT NULL DEFAULT 'pending_verification',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token VARCHAR(255) UNIQUE,
  verification_token_expires_at TIMESTAMP,
  reset_token VARCHAR(255) UNIQUE,
  reset_token_expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- 3. Tabla de perfiles
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  bio TEXT,
  major VARCHAR(100),
  academic_cycle VARCHAR(20),
  profile_photo_url VARCHAR(255),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de grupos
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  benefits TEXT,
  requirements TEXT,
  meeting_mode VARCHAR(20),
  meeting_shift VARCHAR(20),
  max_capacity INTEGER,
  admin_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- 5. Tabla de publicaciones (posts)
CREATE TABLE IF NOT EXISTS publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  group_id UUID REFERENCES groups(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'published',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Índices de publicaciones
CREATE INDEX IF NOT EXISTS ix_publications_user ON publications (user_id);
CREATE INDEX IF NOT EXISTS ix_publications_course ON publications (course_id);
CREATE INDEX IF NOT EXISTS ix_publications_status ON publications (status);
CREATE INDEX IF NOT EXISTS idx_posts_feed ON publications (status, deleted_at, created_at);

-- Índices de usuarios y cursos
CREATE INDEX IF NOT EXISTS ix_users_email ON users (email);
CREATE INDEX IF NOT EXISTS ix_users_status ON users (status);
CREATE INDEX IF NOT EXISTS ix_courses_name ON courses (name);

-- 6. Tabla de miembros de grupos
CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_user ON group_members (group_id, user_id);

-- 7. Tabla de solicitudes de unión
CREATE TABLE IF NOT EXISTS join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  reviewed_by UUID REFERENCES users(id),
  responded_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_join_requests_group_status ON join_requests (group_id, status);
CREATE INDEX IF NOT EXISTS idx_join_requests_requester ON join_requests (requester_id, status);
CREATE INDEX IF NOT EXISTS idx_join_requests_reviewed_by ON join_requests (reviewed_by);
CREATE UNIQUE INDEX IF NOT EXISTS ux_join_requests_pending_unique ON join_requests (group_id, requester_id) WHERE status = 'pending';

-- 8. Habilidades (skills)
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_skills (
  profile_user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_user_id, skill_id)
);

-- 9. Intereses (interests)
CREATE TABLE IF NOT EXISTS interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_interests (
  profile_user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  interest_id UUID NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_user_id, interest_id)
);

-- 10. Disponibilidad horaria (availabilities)
CREATE TABLE IF NOT EXISTS availabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week VARCHAR(20) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_availabilities_user_day ON availabilities (user_id, day_of_week);

-- 11. Mensajes grupales (group_messages)
CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id),
  sender_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'published',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_group_messages_group_date ON group_messages (group_id, created_at);

-- 12. Notificaciones (notifications)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_notifications_user_read ON notifications (user_id, is_read);

-- 13. Reseñas (reviews)
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  reviewed_user_id UUID NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'published',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_reviews_reviewed_user ON reviews (reviewed_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_reviews_reviewer_reviewed ON reviews (reviewer_id, reviewed_user_id);

-- 14. Reportes de moderación (reports)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id),
  publication_id UUID REFERENCES publications(id),
  message_id UUID REFERENCES group_messages(id),
  review_id UUID REFERENCES reviews(id),
  reason VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_reports_status ON reports (status);

-- 15. Registro de moderación (moderation_log)
CREATE TABLE IF NOT EXISTS moderation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID REFERENCES publications(id),
  message_id UUID REFERENCES group_messages(id),
  review_id UUID REFERENCES reviews(id),
  result VARCHAR(50) NOT NULL,
  moderated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 16. Apelaciones (appeals)
CREATE TABLE IF NOT EXISTS appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_log_id UUID NOT NULL REFERENCES moderation_log(id),
  user_id UUID NOT NULL REFERENCES users(id),
  justification TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- DATOS INICIALES (SEMILLAS)
-- ============================================================

-- Usuario Demo
INSERT INTO users (id, email, password_hash, role, status, is_verified, created_at, updated_at)
VALUES ('3fa85f64-5717-4562-b3fc-2c963f66afa6', 'demo.student@ulima.edu.pe', 'hash123', 'student', 'active', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Perfil Demo
INSERT INTO profiles (user_id, name, bio, major, academic_cycle, profile_photo_url, updated_at)
VALUES ('3fa85f64-5717-4562-b3fc-2c963f66afa6', 'Martín Vizcarra', 'Estudiante de Ing. de Sistemas', 'Ingeniería de Sistemas', '5', 'https://avatar.test/martin.png', NOW())
ON CONFLICT (user_id) DO NOTHING;

-- Cursos Iniciales
INSERT INTO courses (id, name, cycle)
VALUES 
  (gen_random_uuid(), 'Cálculo I', 1),
  (gen_random_uuid(), 'Estructuras de Datos', 3),
  (gen_random_uuid(), 'Física I', 2),
  (gen_random_uuid(), 'Programación Orientada a Objetos', 2),
  (gen_random_uuid(), 'Ingeniería de Software I', 5)
ON CONFLICT (name) DO NOTHING;
