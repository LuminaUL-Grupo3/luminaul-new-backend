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
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

-- 15. Tokens revocados (cierre de sesion)
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_revoked_tokens_expires_at ON revoked_tokens(expires_at);

-- ============================================================
-- SEMILLAS ADICIONALES PARA HABILITAR DESARROLLO EN PARALELO
-- ============================================================

-- 1. Segundo Estudiante Demo (para interacción cruzada, reseñas y solicitudes)
INSERT INTO users (id, email, password_hash, role, status, is_verified, created_at, updated_at)
VALUES ('a1b2c3d4-e5f6-47a8-b9c0-123456789abc', 'carlos.mendoza@aloe.ulima.edu.pe', '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2', 'student', 'active', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (user_id, name, bio, major, academic_cycle, profile_photo_url, updated_at)
VALUES ('a1b2c3d4-e5f6-47a8-b9c0-123456789abc', 'Carlos Mendoza', 'Estudiante de 4to ciclo enfocado en algoritmos y estructuras de datos', 'Ingeniería de Sistemas', '4', 'https://avatar.test/carlos.png', NOW())
ON CONFLICT (user_id) DO NOTHING;

-- 2. Administrador Demo (para Dev 7 - Panel de Admin y Auditoría)
INSERT INTO users (id, email, password_hash, role, status, is_verified, created_at, updated_at)
VALUES ('d290f1ee-6c54-4b01-90e6-d701748f0851', 'admin@aloe.ulima.edu.pe', '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2', 'admin', 'active', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (user_id, name, bio, major, academic_cycle, profile_photo_url, updated_at)
VALUES ('d290f1ee-6c54-4b01-90e6-d701748f0851', 'Administrador General', 'Gestión de Comunidad y Moderación LuminaUL', 'Administración', '10', 'https://avatar.test/admin.png', NOW())
ON CONFLICT (user_id) DO NOTHING;

-- 3. Grupo de Estudio Demo (habilita SPEC-04 y SPEC-05 de inmediato)
INSERT INTO groups (id, name, description, benefits, requirements, meeting_mode, meeting_shift, max_capacity, admin_id, created_at)
VALUES ('7b134111-9a22-48df-9fa0-cd8213aa0981', 'Grupo de Cálculo Integral Avanzado', 'Repaso de integrales dobles y triples', 'Exámenes resueltos y asesorías', 'Haber aprobado Cálculo I', 'Presencial', 'Tarde', 6, '3fa85f64-5717-4562-b3fc-2c963f66afa6', NOW())
ON CONFLICT (id) DO NOTHING;

-- Ambos estudiantes son miembros del mismo grupo (permite a Carlos calificar a Martín y viceversa en SPEC-05)
INSERT INTO group_members (group_id, user_id, role, joined_at)
VALUES 
  ('7b134111-9a22-48df-9fa0-cd8213aa0981', '3fa85f64-5717-4562-b3fc-2c963f66afa6', 'admin', NOW()),
  ('7b134111-9a22-48df-9fa0-cd8213aa0981', 'a1b2c3d4-e5f6-47a8-b9c0-123456789abc', 'member', NOW())
ON CONFLICT (group_id, user_id) DO NOTHING;

-- 4. Publicación Demo (para probar Feed en SPEC-03 y Reportes en SPEC-06/07)
INSERT INTO publications (id, user_id, group_id, course_id, type, description, status, created_at, updated_at)
VALUES (
  '18938a12-6f2b-4d43-9801-bca908234fed',
  '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  '7b134111-9a22-48df-9fa0-cd8213aa0981',
  (SELECT id FROM courses WHERE name = 'Cálculo I' LIMIT 1),
  'study_group',
  'Buscamos 2 personas para repasar antes de la PC1 en biblioteca.',
  'published',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 5. Mensaje Grupal de Prueba (para SPEC-04 Chat y reportes en SPEC-06)
INSERT INTO group_messages (id, group_id, sender_id, content, status, created_at)
VALUES (
  'f8a91012-3456-7890-abcd-ef0123456789',
  '7b134111-9a22-48df-9fa0-cd8213aa0981',
  '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  '¡Bienvenidos al grupo de estudio de Cálculo!',
  'published',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 6. Reporte y Moderación de Muestra (habilita SPEC-06 y SPEC-07)
INSERT INTO reports (id, reporter_id, publication_id, reason, status, created_at)
VALUES (
  'd5a19022-77aa-4899-b1c2-349801289fed',
  'a1b2c3d4-e5f6-47a8-b9c0-123456789abc',
  '18938a12-6f2b-4d43-9801-bca908234fed',
  'Contenido potencialmente duplicado o spam',
  'pending',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO moderation_log (id, publication_id, result, moderated_at)
VALUES (
  'e6a21033-88bb-4900-c2d3-450912390abc',
  '18938a12-6f2b-4d43-9801-bca908234fed',
  'flagged',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO appeals (id, moderation_log_id, user_id, justification, status, created_at)
VALUES (
  'f7b32144-99cc-4011-d3e4-561023401bcd',
  'e6a21033-88bb-4900-c2d3-450912390abc',
  '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  'El contenido fue publicado para coordinar la práctica calificada y no infringe normas comunitarias.',
  'pending',
  NOW()
)
ON CONFLICT (id) DO NOTHING;
