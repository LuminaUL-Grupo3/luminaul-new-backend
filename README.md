# LuminaUL Backend (NestJS + TypeScript)

Backend modular de la plataforma **LuminaUL**, desarrollado con **NestJS 12**, **TypeScript 6**, **TypeORM**, **PostgreSQL 16** y documentación interactiva mediante **OpenAPI (Swagger)**.

---

## 1. Requisitos Previos

* **Node.js:** Versión 20 o superior (recomendado Node.js 22 LTS).
* **PostgreSQL:** Versión 16 instalado directamente y activo; configura su puerto y credenciales en `DATABASE_URL`.
* **npm:** Versión 10 o superior.

---

## 2. Instalación y Configuración

### 2.1 Instalar dependencias
```bash
npm ci
```

### 2.2 Variables de Entorno
Copia el archivo `.env.example` a `.env`:
```bash
cp .env.example .env
```
*(En Windows PowerShell: `Copy-Item .env.example .env`)*

El módulo de configuración valida las variables al arranque mediante Zod (`src/config/env.validation.ts`):
```env
PORT=8000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/luminaul
JWT_SECRET=super-secret-key-luminaul-development-2026
JWT_EXPIRES_IN=86400
```
* En `NODE_ENV=production`, `JWT_SECRET` es obligatorio con un mínimo de **32 caracteres**.
* Opcionales soportadas por validación: `DATABASE_SSL` (`true`/`false`), `DATABASE_SSL_REJECT_UNAUTHORIZED`, `WEB_ORIGIN`, `FRONTEND_URL`, `DOMAIN`, `MAIL_TRANSPORT`, `SMTP_*`, `MAIL_FROM` y `OPENAI_API_KEY`.
* **CORS (`src/config/cors.config.ts`):** Normaliza y unifica orígenes desde `WEB_ORIGIN`, `FRONTEND_URL` y `DOMAIN` (con soporte local por defecto cuando ninguno está definido) tanto en HTTP como en Socket.IO.

### 2.3 Inicialización de la Base de Datos
La sincronización automática destructiva de TypeORM está deshabilitada. Para crear el esquema relacional con sus 17 tablas, índices y datos iniciales de catálogo, ejecuta:
```bash
npm run db:init
```
*(Alternativamente, puedes ejecutar directamente el script `init-db.sql` en psql, DBeaver o pgAdmin)*.

`db:init` reinicia tablas: usarlo únicamente para una base nueva y vacía. En una base existente del equipo, aplicar solo las migraciones del módulo correspondiente; para SPEC-04, consultar `src/modules/group-messaging/README.md`.

---

## 3. Ejecución del Servidor

### Modo desarrollo (con recarga automática):
```bash
npm run start:dev
```

### Compilación para producción:
```bash
npm run build
npm run start:prod
```

El build compila directamente con NestJS y genera la documentación OpenAPI para producción sin requerir Docker ni scripts adicionales.

### Puntos de acceso:
* **API REST:** `http://localhost:8000`
* **Swagger UI Interactivo:** `http://localhost:8000/api/docs`
* **Health Check:** `http://localhost:8000/health`

---

## 4. Pruebas Automatizadas (Vitest)

El backend utiliza **Vitest** optimizado con **SWC** (`unplugin-swc`) como framework moderno de pruebas con compilación en memoria ultrarrápida, soporte nativo de ECMAScript Modules (ESM) y decorators de NestJS:

```bash
# Ejecutar todas las pruebas unitarias (src/modules/**)
npm test

# Modo observador interactivo (watch)
npm run test:watch

# Pruebas unitarias
npm run test:unit

# Suite completa de integración E2E (7 módulos integrados)
npm run test:e2e

# Pruebas de WebSockets y mensajería en tiempo real
npm run test:ws

# Suite de auditoría de seguridad y control de acceso (OWASP Top 10)
npm run test:security

# Ejecutar todas las suites combinadas (unitarias + integración)
npm run test:all

# Reporte de cobertura de código
npm run test:cov
```

### Cobertura de la Suite (`test/spec01-spec03.spec.ts`):
* **Bloque 1 (SPEC-01):** Validaciones estrictas de correo institucional `@aloe.ulima.edu.pe`, longitud mínima de contraseñas (10 caracteres), registro transaccional atómico (`users` + `profiles`), bloqueo de cuentas `pending_verification`, flujo de verificación con código OTP numérico de 6 dígitos, y emisión de token JWT con cookie HTTP-only `access_token`.
* **Bloque 2 (SPEC-01 <-> SPEC-03):** Validación transversal con `JwtAuthGuard`, creación y consulta de publicaciones (`POST /posts`, `GET /posts/me`) vinculadas al `userId` del usuario en sesión, y control de acceso RBAC a nivel de recurso (403 Forbidden para usuarios ajenos).
* **Bloque 3 (Seguridad y Revocación):** Cierre de sesión (`POST /auth/logout`) con registro del hash SHA-256 en `revoked_tokens`, invalidación global por cambio de clave (`tokens_valid_after`), y eliminación lógica de cuenta con mitigación anti-enumeración.

---

## 5. Endpoints REST Implementados

### 5.1 Autenticación y Seguridad (SPEC-01)

| Método | Ruta | Descripción | Acceso |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Registro institucional con envío de código OTP | Público |
| `POST` | `/auth/login` | Inicio de sesión (emite JWT y cookie httpOnly) | Público |
| `POST` | `/auth/verify-email` | Verificación de correo con código OTP de 6 dígitos | Público |
| `POST` | `/auth/resend-code` | Reenvío de código OTP (anti-enumeración) | Público |
| `POST` | `/auth/forgot-password` | Solicitud de recuperación de contraseña | Público |
| `POST` | `/auth/reset-password` | Restablecimiento de clave e invalidación de sesiones | Público |
| `GET` | `/auth/me` | Obtiene los datos del estudiante autenticado actual | `Bearer` / Cookie |
| `POST` | `/auth/logout` | Revocación explícita del token de acceso | `Bearer` / Cookie |
| `DELETE` | `/auth/me` | Borrado lógico de cuenta (`status = 'deleted'`) | `Bearer` / Cookie |

### 5.2 Publicaciones y Filtros (SPEC-03 + Catálogo de Cursos)

| Método | Ruta | Descripción | Acceso |
| :--- | :--- | :--- | :--- |
| `POST` | `/posts` | Crear publicación (exclusivo `student`; `admin` recibe `403`) | `Bearer` / Cookie (`UserRole.STUDENT`) |
| `GET` | `/posts` | Feed de publicaciones con filtros, paginación y caché en memoria (TTL `20s`) | Público |
| `GET` | `/posts/me` | Historial de publicaciones del autor autenticado | `Bearer` / Cookie |
| `PUT` | `/posts/:postId` | Editar publicación (solo autor o administrador; `courseId`/`type` inmutables) | `Bearer` / Cookie |
| `DELETE` | `/posts/:postId` | Eliminar publicación (`status = 'hidden'`, retorna `success/deletedId/deletedAt`) | `Bearer` / Cookie |
| `GET` | `/courses` | Catálogo de cursos ordenados alfabéticamente con caché en memoria (TTL `30s`) | Público |

### 5.3 Grupos y Solicitudes de Unión (SPEC-04)

| Método | Ruta | Descripción | Acceso |
| :--- | :--- | :--- | :--- |
| `GET` | `/groups` / `/groups/:groupId` | Directorio público y detalle del grupo (lectura abierta también a `admin`) | Público / Sesión |
| `POST` | `/groups` | Crear grupo de estudio (exclusivo `student`; `admin` recibe `403`) | `Bearer` / Cookie (`UserRole.STUDENT`) |
| `POST` | `/groups/:groupId/join-requests` | Enviar solicitud de ingreso (exclusivo `student`; `admin` recibe `403`) | `Bearer` / Cookie (`UserRole.STUDENT`) |
| `GET` | `/join-requests/me` | Solicitudes recibidas en mis grupos administrados | `Bearer` / Cookie |
| `PATCH` | `/join-requests/:requestId` | Aprobar o rechazar solicitud de unión | `Bearer` / Cookie |

> Para el contrato completo de **SPEC-02 (Perfiles)**, **SPEC-04 (Chat WebSocket `chat:*`)**, **SPEC-05 (Reseñas)**, **SPEC-06 (Moderación)** y **SPEC-07 (Admin & Notificaciones)**, consulta [`../SPECS.md`](../SPECS.md) o Swagger UI en `/api/docs`.

---

## 6. Arquitectura y Buenas Prácticas

1. **Desacoplamiento Estricto (AGENTS.md Regla 3.3):** Los módulos no importan entidades de TypeORM entre sí (incluyendo `PostEntity`, que consulta perfiles y cursos mediante identificadores lógicos UUID y SQL parametrizado).
2. **RBAC y Guards Compartidos:** `RolesGuard` y `@Roles()` en `src/common/` aplican control de acceso por rol (`UserRole.STUDENT` / `UserRole.ADMIN`); `HttpExceptionFilter` normaliza respuestas de error incluyendo siempre el campo `error`.
3. **Caché en Memoria Anti-Stampede (`src/common/cache/in-memory-ttl.cache.ts`):** `InMemoryTtlCache` cachea `/courses` (TTL `30s`) y el feed canónico de `/posts` (TTL `20s`, clave ordenada de filtros e invalidación automática ante mutaciones y moderación), evitando caché en `/posts/me` por privacidad.
4. **Chain of Responsibility y Seguridad Defensiva:** La validación de JWT (`SessionService`) valida firma, `revoked_tokens`, `tokens_valid_after` y estado de cuenta activo; prevención de timing attacks y anti-enumeración en autenticación.
