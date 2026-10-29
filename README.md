# LuminaUL Backend (NestJS + TypeScript)

Backend de la plataforma LuminaUL implementado en **NestJS** con **TypeScript**, **TypeORM**, **PostgreSQL** y **OpenAPI (Swagger)**.

---

## 🚀 Requisitos Previos

* **Node.js** v20 o superior.
* **PostgreSQL** v15+ corriendo localmente o en un contenedor Docker en el puerto 5432.

---

## 🛠️ Instalación y Configuración

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar Variables de Entorno
Copia el archivo `.env.example` a `.env`:
```bash
cp .env.example .env
```
*(En Windows PowerShell: `Copy-Item .env.example .env`)*

Ajusta la URL de conexión a tu base de datos en `.env`:
```env
PORT=8000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/luminaul
JWT_SECRET=super-secret-key-luminaul-development-2026
JWT_EXPIRES_IN=86400
```

### 3. Ejecutar la Migración Manual e Inicializar Semillas
La sincronización automática de TypeORM está **deshabilitada por seguridad**. Para crear las 17 tablas y sembrar los datos iniciales para el desarrollo en paralelo, ejecuta:
```bash
npm run db:init
```
*(Alternativamente, puedes importar el archivo `init-db.sql` usando psql, DBeaver o pgAdmin)*.

---

## ▶️ Ejecución del Servidor

### Modo desarrollo (con recarga en caliente):
```bash
npm run start:dev
```

El servidor estará escuchando en:
* **API REST**: `http://localhost:8000`
* **Swagger UI interactivo**: `http://localhost:8000/docs`
* **Health Check**: `http://localhost:8000/health`

---

## 👥 Cuentas Demo Sembradas (disponibles tras `npm run db:init`)

| Rol | Correo | Contraseña | Propósito |
| :--- | :--- | :--- | :--- |
| **Alumno 1** | `demo.student@ulima.edu.pe` | `Password123!` | Creador del Grupo de Cálculo I y autor de posts |
| **Alumno 2** | `carlos.mendoza@aloe.ulima.edu.pe` | `Password123!` | Miembro del Grupo; permite probar reseñas (SPEC-05) y reportes (SPEC-06) |
| **Admin** | `admin@aloe.ulima.edu.pe` | `Password123!` | Acceso completo al panel administrativo `/admin/*` (SPEC-07) |

---

## 🧪 Pruebas Automatizadas

```bash
# Pruebas de integración del Sprint 1 (Posts y Catálogos):
npm run test:sprint1

# Pruebas de integración del Sprint 2 (Grupos y Solicitudes):
npm run test:sprint2
```

---

## 📋 Endpoints Principales

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/health` | Verificación de estado del servidor |
| `GET` | `/courses` | Listado alfabético de cursos |
| `POST` | `/posts` | Crear publicación (con grupo automático o vinculado) |
| `GET` | `/posts` | Feed de publicaciones públicas con filtros |
| `GET` | `/posts/me` | Historial de publicaciones del usuario actual |
| `PUT` | `/posts/:post_id` | Editar publicación existente |
| `DELETE` | `/posts/:post_id` | Eliminar publicación (soft delete) |
| `GET` | `/groups/:group_id` | Detalle del grupo y estado del usuario (`my_status`) — H.U 2.1 |
| `POST` | `/groups/:group_id/join-requests` | Enviar solicitud de unión a un grupo — H.U 2.1 |
| `GET` | `/join-requests/me` | Solicitudes pendientes de mis grupos — H.U 2.2 |
| `PATCH` | `/join-requests/:request_id` | Aceptar o rechazar una solicitud — H.U 2.2 |
