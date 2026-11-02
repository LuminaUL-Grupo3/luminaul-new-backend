# LuminaUL Backend (NestJS + TypeScript)

Backend modular de la plataforma **LuminaUL**, desarrollado con **NestJS 10**, **TypeScript 5**, **TypeORM**, **PostgreSQL 16**, arquitectura limpia y documentación interactiva mediante **OpenAPI (Swagger)**.

---

## 1. Requisitos Previos

* **Node.js:** Versión 20 o superior (recomendado Node.js 22 LTS).
* **PostgreSQL:** Versión 16 instalado directamente y activo; configura su puerto y credenciales en `DATABASE_URL`.
* **npm:** Versión 10 o superior.

---

## 2. Instalación y Configuración

### 2.1 Instalar dependencias
```bash
npm install
```

### 2.2 Variables de Entorno
Copia el archivo `.env.example` a `.env`:
```bash
cp .env.example .env
```
*(En Windows PowerShell: `Copy-Item .env.example .env`)*

Asegúrate de que los valores de conexión coincidan con tu base de datos local en `.env`:
```env
PORT=8000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/luminaul
JWT_SECRET=super-secret-key-luminaul-development-2026
JWT_EXPIRES_IN=86400
```

### 2.3 Inicialización de la Base de Datos
La sincronización automática destructiva de TypeORM está deshabilitada. Para crear el esquema relacional con sus 17 tablas, índices y datos iniciales de catálogo, ejecuta:
```bash
npm run db:init
```
*(Alternativamente, puedes ejecutar directamente el script `init-db.sql` en psql, DBeaver o pgAdmin)*.

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

### Puntos de acceso:
* **API REST:** `http://localhost:8000`
* **Swagger UI Interactivo:** `http://localhost:8000/docs`
* **Health Check:** `http://localhost:8000/health`

---

## 4. Pruebas Automatizadas (Jest / xUnit)

El backend utiliza **Jest** como framework estándar de la familia xUnit para pruebas de integración contra la base de datos real PostgreSQL:

```bash
# Ejecutar la suite completa de integración con Jest
npm test

# Ejecutar la suite de integración SPEC-01 (Auth) <-> SPEC-03 (Posts)
npm run test:integration
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

### 5.2 Publicaciones y Filtros (SPEC-03)

| Método | Ruta | Descripción | Acceso |
| :--- | :--- | :--- | :--- |
| `POST` | `/posts` | Crear publicación (vinculada al autor en sesión) | `Bearer` / Cookie |
| `GET` | `/posts` | Feed de publicaciones con soporte de filtros y paginación | Público |
| `GET` | `/posts/me` | Historial de publicaciones del autor autenticado | `Bearer` / Cookie |
| `PUT` | `/posts/:post_id` | Editar publicación (solo autor o administrador) | `Bearer` / Cookie |
| `DELETE` | `/posts/:post_id` | Eliminar publicación (soft delete con status inactive) | `Bearer` / Cookie |
| `GET` | `/courses` | Catálogo de cursos ordenados alfabéticamente | Público |

### 5.3 Grupos y Solicitudes de Unión (SPEC-04)

| Método | Ruta | Descripción | Acceso |
| :--- | :--- | :--- | :--- |
| `GET` | `/groups/:group_id` | Detalle del grupo y estado del usuario (`my_status`) | `Bearer` / Cookie |
| `POST` | `/groups/:group_id/join-requests` | Enviar solicitud de ingreso a un grupo | `Bearer` / Cookie |
| `GET` | `/join-requests/me` | Solicitudes recibidas en mis grupos administrados | `Bearer` / Cookie |
| `PATCH` | `/join-requests/:request_id` | Aprobar o rechazar solicitud de unión | `Bearer` / Cookie |

---

## 6. Arquitectura y Buenas Prácticas

1. **Desacoplamiento Estricto (AGENTS.md Regla 3.2):** Los módulos no importan entidades de TypeORM entre sí. Las relaciones se manejan mediante identificadores lógicos UUID (`userId`, `groupId`, `courseId`).
2. **Chain of Responsibility:** La validación de tokens de acceso (`SessionService`) se ejecuta a través de una cadena de eslabones independientes (`SignatureCheck`, `RevocationCheck`, `TokensValidAfterCheck`, `ActiveAccountCheck`) ordenados de menor a mayor costo computacional.
3. **Validación Dual de Sesiones:** Toda petición autenticada valida tanto la presencia del hash en `revoked_tokens` como la vigencia temporal contra `user.tokens_valid_after`.
4. **Seguridad Defensiva:** Prevención de ataques de tiempo (*timing attacks*) en login y respuesta uniforme anti-enumeración en recuperación de credenciales.
