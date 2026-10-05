# LuminaUL Backend (NestJS + TypeScript)

Backend de la plataforma LuminaUL refactorizado a **NestJS** con **TypeScript**, **TypeORM** y **OpenAPI (Swagger)**.

---

## 🚀 Requisitos Previos

* **Node.js** v22.12 o superior.
* **PostgreSQL** corriendo localmente o en un contenedor Docker.

---

## 🛠️ Instalación y Configuración

### 1. Descomprimir e instalar dependencias
```bash
npm install
```

### 2. Configurar Variables de Entorno
Copia el archivo `.env.example` a `.env`:
```bash
cp .env.example .env
```
Ajusta la URL de conexión a tu base de datos en `.env`:
```env
DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/luminaul
PORT=8000
```

### 3. Ejecutar la Migración Manual de la Base de Datos
La sincronización automática de TypeORM está **deshabilitada por seguridad**. Para crear las tablas y datos iniciales de forma manual, ejecuta:
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
* **API**: `http://localhost:8000`
* **Swagger UI interactivo**: `http://localhost:8000/docs`

---

## 🧪 Pruebas Automatizadas (Sprint 1)

Para ejecutar las suites heredadas de Sprint 1/Sprint 2 y las pruebas HTTP de autenticación, registro, correo, perfiles, horarios y reseñas sobre una base aislada:
```bash
npm run test:integration
```

---

## 📋 Endpoints Disponibles

Consulta [la guía de integración](docs/INTEGRACION_ROBERT.md) para los contratos de cuentas, perfiles y disponibilidad, el arranque con Docker y el buzón local de verificación en `http://localhost:8026`. Antes de arrancar una copia existente, ejecuta `npm run db:init`: agrega de forma idempotente los campos de intentos de verificación y versión de sesión.

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
