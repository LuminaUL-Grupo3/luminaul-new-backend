# SPEC-04 — Grupos de estudio y chat en tiempo real

Implementación de las tareas 4.1–4.4 de la especificación entregada: entidades, Gateway, REST y conexión con React. Base de esta rama: `origin/main` en `9799d97c7f3d8844ef5085e9146bba429de6d758` (1 de noviembre de 2026). Rama: `SPEC04-grupos-chat-tiempo-real`.

## Alcance y límites

- Crear y descubrir grupos; filtrar por curso y modalidad; consultar grupos propios e integrantes.
- Solicitar ingreso, aprobar/rechazar, validar duplicados y cupos en una transacción.
- Abandonar, expulsar y transferir liderazgo. La salida conserva `group_members` con estado `left` o `kicked` y `left_at`, para el dominio de reseñas. Un expulsado puede solicitar nuevamente: necesita otra aprobación del líder.
- Chat privado para miembros activos: historial paginado, mensajes con ACK y reintentos sin duplicados.
- Extras solicitados para el chat: escritura, presencia por usuario con múltiples pestañas, reacciones, lecturas y respuestas a mensajes.
- Puente hacia SPEC-06 para ocultar mensajes y citas. El motor de moderación pertenece a esa SPEC; aquí no se implementa un filtro paralelo.

No se incorporan adjuntos, encuestas, mensajes privados, edición, eliminación ni mensajes fijados. Tampoco se modifican autenticación, perfiles, publicaciones, reseñas o administración.

Los únicos ajustes fuera de esta carpeta son los autorizados de integración: registrar `GroupMessagingModule` en `src/app.module.ts`, retirar de allí el módulo antiguo de solicitudes y desregistrar el controlador antiguo de `src/groups/groups.module.ts`. Sus proveedores y exportaciones siguen disponibles para publicaciones. Esto evita dos controladores respondiendo las mismas rutas.

## Decisiones frente al código real de main

Se conserva el stack y las dependencias existentes; no se modifica `package.json`, el lock, `.env`, Docker ni los archivos de configuración compartida. Main usa NestJS 12/TypeScript 6 en backend y React 19/TypeScript 5.9 en frontend. No se degrada el proyecto a las versiones antiguas del protocolo.

El contrato específico y el código actual usan `student`/`admin` para plataforma y `leader`/`member` para grupos, en minúsculas. El rol `admin` no se utiliza como rol canónico de grupo. Se mantiene `admin_id` únicamente como columna heredada que main sincroniza con `leader_id`.

Se reutiliza `SessionService` de autenticación a través de `GroupSession`. Las referencias a otros dominios son UUID escalares y consultas SQL parametrizadas; no se importan entidades ajenas. El catálogo actual no tiene código de curso: `courseCode` se conserva como texto validado del grupo, sin inventar una FK hacia una columna inexistente.

## Arquitectura y fundamentos

| Componente | Responsabilidad |
| --- | --- |
| Controladores | HTTP, DTOs y delegación al servicio. |
| `ChatGateway` | Sesión, validación, salas, ACK y difusión Socket.IO. |
| `GroupMessagingService` | Orquestar casos de uso y publicar eventos después de persistir. |
| Repositorios | SQL parametrizado y transacciones; invariantes de cupos, liderazgo y membresía. |
| `GroupSession` | Adaptar el contrato de sesión existente al dominio de grupos. |
| `RoomPresence` | Presencia y escritura efímeras por sala, usuario y conexión. |

La separación implementa responsabilidad única y evita duplicar lógica entre HTTP y WebSocket. La inyección de dependencias permite sustituir colaboradores; los DTOs e interfaces definen contratos explícitos. Repositorios/DAO concentran persistencia, el adaptador de sesión desacopla autenticación y EventEmitter2 aplica comunicación mediante eventos con moderación. No se añaden patrones que no tengan un uso concreto.

Todas las entradas usan clases con `class-validator`/`class-transformer`; no se usa `any` explícito en la implementación nueva. El Gateway recibe `unknown` y valida la clase dentro de su envoltorio para devolver siempre ACK de error: el ValidationPipe HTTP global no debe interrumpir esa confirmación.

## Preparación local aislada

Requisitos: Node compatible con main, Docker para la base de demostración o un PostgreSQL local equivalente, y las dos ramas descargadas. Estos comandos se ejecutan desde la raíz del backend en PowerShell.

El lock publicado en main no permite `npm ci`: faltan entradas transitivas de `@istanbuljs/load-nyc-config` y `es-object-atoms`. Hasta que el integrador lo corrija, la instalación local comprobada sin cambiarlo es:

```powershell
npm install --package-lock=false --ignore-scripts
node node_modules/typescript/bin/tsc -p tsconfig.build.json --incremental false
docker run --name luminaul-spec04-pg -e POSTGRES_PASSWORD=spec04_local_only -p 127.0.0.1:55436:5432 -d postgres:16-alpine
node src/modules/group-messaging/tools/local.cjs prepare
node src/modules/group-messaging/tools/local.cjs serve
```

Si el contenedor ya existe, usar `docker start luminaul-spec04-pg` en lugar de crearlo otra vez. No se necesita modificar los Dockerfiles compartidos. Backend de demostración: `http://127.0.0.1:8004`; documentación HTTP: `/docs`.

`local.cjs` solo admite las bases `luminaul_spec04_demo` y `luminaul_spec04_test` en localhost:55436. Ejecuta el SQL inicial únicamente en una base vacía propia. Nunca apunta a Neon ni reinicia la base del equipo. La contraseña local anterior no es una credencial de producción.

En otra terminal, desde la raíz del frontend:

```powershell
npm ci
$env:BACKEND_URL='http://127.0.0.1:8004'
npm run dev -- --port 5175
```

Abrir `http://localhost:5175/login`. Cuentas de esta demostración, no publicadas en las pantallas:

| Cuenta | Correo | Contraseña |
| --- | --- | --- |
| Líder | `spec04.lider@aloe.ulima.edu.pe` | `LuminaSpec04!2026` |
| Integrante | `spec04.usuario@aloe.ulima.edu.pe` | `LuminaSpec04!2026` |
| Otra persona | `spec04.otro@aloe.ulima.edu.pe` | `LuminaSpec04!2026` |

Las dos primeras pertenecen inicialmente a Taller de Software II; la tercera puede solicitar ingreso. Son cuentas de estudiante, no administradores de plataforma. Usar ventanas o perfiles distintos para probarlas simultáneamente. El servidor de demostración crea su propio secreto JWT al arrancar: tras reiniciarlo hay que iniciar sesión otra vez.

## Integración con una base del equipo existente

Esta rama necesita el esquema v3 que ya está en main: grupos, membresías con estado e ID, solicitudes, mensajes, usuarios y perfiles. La extensión de SPEC-04 añade únicamente dos columnas de mensajes, índices, `message_reactions` y `group_read_markers`. No altera cuentas ni elimina datos.

Después de configurar la conexión habitual `DATABASE_URL`, compilar y aplicar solamente la extensión:

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.build.json --incremental false
node src/modules/group-messaging/tools/migrate.cjs
node dist/main.js
```

El helper de migración lee la configuración existente, ejecuta `up` dentro de una transacción y es repetible; no registra una segunda infraestructura de migraciones. **No ejecutar `db:init`/`init-db.sql` sobre una base existente:** el SQL de main reinicia tablas. No se ha ejecutado esta migración en la nube del equipo.

En Windows, `npm run build` termina, pero el plugin Swagger de main genera una importación absoluta a `src/auth/enums/user-role.enum` que hace fallar `node dist/main.js`. Se comprobó que la compilación directa con TypeScript mostrada arriba y el arranque compilado funcionan. El archivo afectado de autenticación y `nest-cli.json` no cambian en esta rama; queda pendiente del integrador corregir el plugin. El helper `serve` usa `ts-node` y también funciona. No confundir compilación exitosa con arranque verificado.

Permitir en `WEB_ORIGIN` los orígenes reales del frontend, separados por coma. Para desarrollo, Vite usa `BACKEND_URL` para reenviar HTTP y `/socket.io`. Para otro despliegue, conservar el cliente y la configuración compartidos del equipo.

## REST

| Método y ruta | Acceso / resultado |
| --- | --- |
| `GET /groups?courseCode=ISW2&meetingMode=virtual&limit=24&offset=0` | Directorio público; no revela conversaciones a terceros. |
| `GET /groups/me` | Mis grupos activos con actividad y no leídos. |
| `POST /groups` | Crea grupo y membresía del líder autenticado atómicamente. |
| `GET /groups/:groupId` | Detalle público y situación del usuario; sin correos de integrantes. |
| `GET /groups/:groupId/members` | Solo integrantes activos. |
| `POST /groups/:groupId/join-requests` | Presentación opcional, máximo 255 caracteres. |
| `GET /groups/:groupId/join-requests` | Solo líder; pendientes de su grupo. |
| `GET /groups/pending-requests` | Pendientes de todos los grupos liderados. |
| `PATCH /groups/:groupId/join-requests/:requestId` | Líder; `{status:'approved'}` o `rejected`. |
| `DELETE /groups/:groupId/members/me` | Salida; el líder debe transferir primero. |
| `DELETE /groups/:groupId/members/:userId` | Expulsión por el líder; no puede expulsarse a sí mismo. |
| `PATCH /groups/:groupId/leader` | Líder; `{userId}` de otro integrante activo. |
| `GET /groups/:groupId/messages?limit=50&beforeId=UUID` | Historial privado, página cronológica con cursor estable. |

Se conservan `GET /join-requests/me` y `PATCH /join-requests/:id` como adaptación de solicitudes antiguas (`accepted` se traduce a `approved`). Las pantallas nuevas usan el contrato canónico. No se registra una segunda ruta antigua de grupos.

## WebSocket y garantías prácticas

Handshake con la sesión real: `auth.token` o cookie HttpOnly. No admite identidades enviadas por el usuario. Se comprueba el origen del handshake, la sesión en cada acción y la pertenencia activa antes de persistir y difundir. Una salida/expulsión retira todas las pestañas del usuario de esa sala. Un barrido revoca sesiones inactivas; antes de difundir contenido se vuelven a comprobar destinatarios.

| Evento cliente | Payload | Resultado |
| --- | --- | --- |
| `chat:join_room` | `{groupId}` | ACK con `userIds`, solo miembros. |
| `chat:leave_room` | `{groupId}` | Abandona esa sala, no toda la conexión. |
| `chat:send_message` | `{groupId,content,clientMessageId?,replyToId?}` | ACK con `message`; texto hasta 4000 caracteres. |
| `chat:typing` | `{groupId,isTyping}` | Escritura efímera; vence si se interrumpe la conexión. |
| `reaction:add` / `reaction:remove` | `{groupId,messageId,emoji}` | Estado persistido; opciones ❤️ 😂 👍 🔥. |
| `message:read` | `{groupId,messageId}` | Marcador persistido que nunca retrocede. |

ACK de éxito: `{success:true,...resultado}`. Error: `{success:false,error:{code,message}}` y `chat:error`. Otros eventos de salida: `chat:new_message`, `chat:message_updated`, `chat:typing`, `chat:presence`, `chat:read`, `chat:message_hidden`, `chat:membership_revoked` y `chat:group_changed`.

El emisor recibe el mensaje mediante ACK; los demás sockets de la sala mediante `socket.to(room).emit`. La interfaz combina datos por ID. Para un envío nuevo, React genera `clientMessageId`; al perder el ACK reintenta la misma clave. La restricción única y la transacción impiden una segunda inserción. El payload mínimo original sin esa clave sigue aceptándose, pero no ofrece idempotencia de reintentos. Socket.IO por sí solo no sustituye esta persistencia ni recupera automáticamente todo el historial perdido: se vuelve a consultar REST al reconectar.

El cursor usa `(created_at,id)` con precisión de microsegundos para no omitir mensajes durante nuevos envíos. El frontend marca lectura con la conversación enfocada y el final visible; el servidor conserva el máximo confirmado. La presencia cuenta usuarios únicos **dentro de esa conversación**, no todas las personas conectadas a la plataforma. Dos pestañas cuentan como una; cerrar una no desconecta la otra. Presencia y escritura están en memoria, apropiadas para una instancia; escalar a varias requiere otro diseño del integrador. Mensajes, respuestas, reacciones y lecturas permanecen en PostgreSQL.

## Contrato para SPEC-06

Tras persistir un mensaje nuevo se emite internamente:

```ts
events.emit('content.created', {
  contentType: 'message', contentId: message.id,
  authorId: userId, text: content, groupId,
});
```

El módulo de moderación debe guardar primero `status='hidden'` y después emitir internamente `chat:message_hidden` con `{groupId,messageId}`. El Gateway verifica ese estado y notifica a miembros autorizados. REST y React ocultan también el cuerpo de las citas. Un reintento de un envío ya persistido no vuelve a emitir `content.created`. La prueba usa un fixture por IPC, habilitado solo en el servidor de test: no existe un endpoint público de moderación de prueba.

## Verificación reproducible

Desde backend:

```powershell
node --experimental-vm-modules node_modules/jest/bin/jest.js src/modules/group-messaging/gateways/room-presence.spec.ts --runInBand
```

Desde frontend, con las carpetas de ambos repos como hermanas `frontend` y `backend` (o `SPEC04_BACKEND_DIR` apuntando al backend):

```powershell
node src/features/chat/tests/run-integration.mjs
```

La suite arranca servidores reales en 8005/5176, usa exclusivamente `luminaul_spec04_test` local, inicia tres usuarios con SPEC-01 y abre Edge headless mediante Playwright ya incluido en main. `BROWSER_CHANNEL=chrome` permite otro navegador instalado. Puede separarse con `--network-only` o `--browser-only`.

Resultado del 1 de noviembre: 13 grupos de comprobaciones de REST/Socket.IO/navegador aprobados, 3 pruebas unitarias de presencia aprobadas y las 22 pruebas existentes `test/spec01-spec03.spec.ts` aprobadas sobre la base local de test. Se verificaron permisos, último cupo concurrente, reintentos concurrentes, fallo real de PostgreSQL sin mensajes fantasma, cursor estable, moderación de citas, expulsión, token revocado, reconexión, múltiples pestañas y móvil sin desbordamiento. Las capturas, logs y `results.json` se escriben en `frontend/analysis/spec04`, excluidos del commit. No constituyen pruebas de carga ni validación de un despliegue en la nube.

Referencias técnicas: [Gateways de NestJS](https://docs.nestjs.com/websockets/gateways), [garantías de entrega de Socket.IO](https://socket.io/docs/v4/delivery-guarantees/), [middleware de Socket.IO](https://socket.io/docs/v4/middlewares/).
