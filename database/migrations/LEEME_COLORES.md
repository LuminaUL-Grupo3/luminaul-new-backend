# Color de publicaciones

Antes de iniciar el backend actualizado sobre una base existente, ejecutar las migraciones pendientes en orden: `20261113_publication_color.sql` agrega la columna; `20261114_publication_color_white.sql` añade Blanco y lo establece como predeterminado. Si ya se aplicó la primera, ejecutar solamente la segunda. La actualización conserva las elecciones de color existentes. No elimina publicaciones. Las bases nuevas incorporan directamente las once opciones mediante `database/init-db.sql`.

POST /posts y PUT /posts/:id aceptan `color` opcional. Al crear sin color se utiliza `white`; al editar sin ese campo se conserva el valor anterior. Se devuelve en detalle, feed e historial. Se conservan los permisos de edición del autor/administrador; otro alumno no puede cambiar el color de una publicación ajena. Un color fuera de la lista responde HTTP 400. El frontend usa el tono solo en una franja superior; el cuerpo permanece blanco.

La presentación de tarjetas compactas/amplias es una preferencia local por usuario; no usa esta columna. Desplegar frontend y backend de esta revisión juntos.
