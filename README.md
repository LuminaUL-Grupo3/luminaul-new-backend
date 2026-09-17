# LuminaUL Backend (NestJS + TypeScript)

Backend de la plataforma LuminaUL refactorizado a **NestJS** con **TypeScript**, **TypeORM** y **OpenAPI (Swagger)**.

---

## 🚀 Requisitos Previos

* **Node.js** v18 o superior (v20+ recomendado).
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

Para ejecutar la suite de 24 pruebas de integración que validan todas las Historias de Usuario (H.U 1.1 a 1.6):
```bash
npm run test:sprint1
```

---

## 📋 Endpoints Disponibles

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/health` | Verificación de estado del servidor |
| `GET` | `/courses` | Listado alfabético de cursos |
| `POST` | `/posts` | Crear publicación (con grupo automático o vinculado) |
| `GET` | `/posts` | Feed de publicaciones públicas con filtros |
| `GET` | `/posts/me` | Historial de publicaciones del usuario actual |
| `PUT` | `/posts/:post_id` | Editar publicación existente |
| `DELETE` | `/posts/:post_id` | Eliminar publicación (soft delete) |
