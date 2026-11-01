// Roles de plataforma (users.role). Valores en minúsculas para coincidir con
// init-db.sql, los seeds y el frontend (decisión del equipo sobre AGENTS.md §3.1).
export enum UserRole {
  STUDENT = 'student',
  ADMIN = 'admin',
}

export const USER_ROLES = Object.values(UserRole);
