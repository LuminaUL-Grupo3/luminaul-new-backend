# Integración del Sprint 2

Se completa autenticación sobre este backend NestJS/TypeORM del equipo; no se incorpora el backend de referencia anterior.

| Método y ruta | Contrato |
|---|---|
| POST `/auth/login` | `{ email, password }`; retorna `{ id, name, email, role }` y cookie `access_token` HTTPOnly |
| GET `/auth/me` | Retorna el usuario de la sesión vigente; 401 si no hay token válido; 403 si la cuenta deja de estar activa/verificada |
| POST `/auth/logout` | Conserva el endpoint del equipo; revoca el token y elimina la cookie |
| POST `/auth/register` | `{ name, email, password }`; crea usuario y perfil en una transacción. Devuelve `email_sent` y un mensaje; nunca el código ni la contraseña |
| POST `/auth/verify` | `{ email, code }`; seis dígitos, vigencia de 15 minutos y hasta cinco intentos por código |
| POST `/auth/verification` | `{ email }`; reenvía e invalida el código anterior de una cuenta pendiente |
| POST `/auth/recover` | `{ email }`; respuesta genérica y enlace de recuperación por correo para una cuenta activa |
| POST `/auth/reset` | `{ token, password }`; enlace de un uso, 15 minutos; invalida sesiones anteriores |
| PUT `/auth/password` | `{ current_password, password }`; exige sesión y contraseña actual; invalida sesiones anteriores |
| GET `/profiles/me`, `/profiles/:id` | Perfil real con habilidades, intereses, foto, horario y promedio de reseñas; requiere sesión |
| PUT `/profiles/me` | `{ name, bio, major, academic_cycle, skills, interests }`; solo actualiza el perfil propio |
| POST `/profiles/me/photo` | Multipart `photo`: PNG/JPG/WebP, hasta 2 MB, firma de archivo comprobada y nombre generado |
| POST `/availability` | `{ day_of_week, start_time, end_time }`; lunes=1, domingo=7, formato HH:mm; fin posterior al inicio, sin cruces |
| PUT, DELETE `/availability/:id` | Modifica o elimina únicamente franjas del usuario de sesión |
| GET `/profiles/:id/reviews`, `/profiles/:id/review-eligibility` | Reseñas publicadas y permiso real para reseñar a un compañero de grupo |
| GET `/reviews/me`; POST `/reviews`; PUT, DELETE `/reviews/:id` | Consultar las propias, crear `{ reviewed_user_id, rating, comment }`, editar o eliminar con control de autoría |
| GET `/groups` | Grupos de los que es miembro el usuario de sesión |
| GET `/groups/:id` | Conserva el detalle y `my_status`; agrega `members` para miembros y administrador |
| POST `/groups/:id/join-requests` | Conserva `{ message }`; solicitante obtenido de la sesión |
| GET `/join-requests/me` | Conserva `{ requests, total, message }` para grupos administrados por el usuario |
| PATCH `/join-requests/:id` | Conserva `{ action: "accepted" \| "rejected" }` |
| GET `/posts/:id` | Precarga del editor existente, sujeto a sesión y visibilidad de la publicación |

Las rutas personales están protegidas con el guard JWT del equipo. No se acepta un usuario de demostración cuando falta la sesión. Los tokens duran una hora y tienen un identificador único; logout almacena su hash hasta que expiran. La autorización de aceptar/rechazar sigue dependiendo del administrador de cada grupo, no del rol global de la cuenta.

`AuthController` recibe y entrega HTTP/cookies; `AuthService` valida credenciales y cuenta; `AuthRepository` gestiona usuarios, códigos, recuperación y revocaciones; `PasswordHasher` encapsula bcrypt. `MailDelivery` define el contrato y `SmtpMailDelivery` lo implementa con SMTP. Profiles y Reviews también separan Controller → Service → Repository; `ProfilePhotoStorage` encapsula archivos. Los hashes ficticios de las semillas heredadas no sirven para iniciar sesión.

Los códigos se almacenan con HMAC, no en texto plano. La contraseña admite 10–72 bytes y al menos 10 caracteres. El login acepta contraseñas anteriores desde un carácter, limitadas a 72 bytes. Un contador de versión en el usuario permite invalidar todas sus sesiones al restablecer/cambiar contraseña. Las rutas públicas de autenticación admiten 20 peticiones por minuto por IP/ruta en este proceso; un despliegue con varias instancias requerirá un contador compartido.

## Arranque local

```powershell
npm.cmd ci
npm.cmd run setup:local
docker compose up -d --wait
npm.cmd run db:init
npm.cmd run db:seed:local
npm.cmd run start:dev
```

La semilla solo admite bases locales con nombre `luminaul_equipo` y sus variantes de pruebas, y rechaza producción. Crea Usuario (`usuario.prueba@aloe.ulima.edu.pe`), Administrador (`administrador.prueba@aloe.ulima.edu.pe`) y Ana Torres (`ana.prueba@aloe.ulima.edu.pe`), con contraseña local `LuminaLocal2026!`. No muestra credenciales en la web.

El comando `db:init` agrega `verification_attempts` y `session_version` de forma idempotente; no recrea ni borra usuarios existentes. PostgreSQL usa 55434. Mailpit recibe SMTP en 11026 y muestra los correos en **http://localhost:8026**. Los códigos para una cuenta registrada se copian desde ese buzón local; Mailpit no los entrega a la bandeja institucional.

Para enviar a correos reales, configura en `.env` `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE` (`true` para TLS directo, por ejemplo puerto 465; `false` para STARTTLS, por ejemplo 587), `MAIL_USER`, `MAIL_PASSWORD` y `MAIL_FROM` con los datos de un proveedor SMTP. `WEB_ORIGIN` debe ser la URL real del frontend para los enlaces de recuperación. No subas `.env` ni credenciales del proveedor. Si falla la entrega del registro, la cuenta queda pendiente y la respuesta informa que debe solicitar otro código.

Las fotos se guardan en `uploads/profiles`, excluido de Git. Un despliegue deberá conservar ese directorio con almacenamiento persistente. Registro y cambios de perfil no inventan carrera, ciclo, habilidades ni calificación: un perfil nuevo entrega esos datos vacíos o nulos hasta completarlos.

Swagger está en `/docs`. Se reemplazó el plugin de generación automática por decoradores explícitos porque producía imports absolutos del código fuente que impedían iniciar el compilado en esta ruta de Windows con tildes. `npm run start:prod` usa el archivo real `dist/main.js`.

## Pruebas

`npm.cmd run test:integration` crea `luminaul_equipo_test` en el mismo PostgreSQL aislado y ejecuta las suites heredadas de Sprint 1/Sprint 2, seguidas por autenticación/solicitudes y cuentas/perfiles vía HTTP. Requiere los dos servicios de Docker Compose. Las suites heredadas contienen borrados amplios; deben ejecutarse por este comando aislado. Los nuevos runners rechazan una base diferente a la de pruebas.

Los casos cubren identidad de sesión, correo institucional, credenciales incorrectas, cuenta suspendida/no verificada, cookie HTTPOnly, protección de endpoints, duplicados, autorización del administrador, membresía tras aceptación, competencia aceptar/rechazar y revocación de logout. Aceptar/rechazar simultáneamente usa una actualización condicionada al estado pending, evitando que una segunda decisión sobrescriba la primera.

Las nuevas pruebas verifican correo SMTP real en Mailpit, registro duplicado, rol estudiante forzado, bloqueo/expiración/reenvío de códigos, recuperación de un uso, revocación de sesiones, perfil persistido, foto y su descarga, horarios con cruce concurrente y propiedad, reseñas entre compañeros y promedio. No se usan respuestas simuladas para estas comprobaciones.

Quedan pendientes chat/notificaciones, reportes/moderación, eliminación de cuenta, transferencia/expulsión/salida de grupos y funciones completas de administración. Las pantallas de esos módulos se conservan y comunican indisponibilidad si su ruta aún no existe. Esta rama contiene la integración de las cuatro historias del Sprint 2 de Robert y la corrección de cuentas/perfiles; no equivale a completar todo el curso.
