# Color de publicaciones

Antes de iniciar el backend actualizado sobre una base existente, ejecutar `20261113_publication_color.sql` en PostgreSQL. La migración agrega `publications.color`, conserva los registros existentes con `peach` y limita el valor a los diez tonos permitidos. No elimina publicaciones. Las bases nuevas incorporan la columna mediante `database/init-db.sql`.

POST /posts y PUT /posts/:id aceptan `color` opcional. Se devuelve en detalle, feed e historial. Se conservan los permisos de edición del autor/administrador; otro alumno no puede cambiar el color de una publicación ajena. Un color fuera de la lista responde HTTP 400.

La presentación de tarjetas compactas/amplias es una preferencia local por usuario; no usa esta columna. Desplegar frontend y backend de esta revisión juntos.
