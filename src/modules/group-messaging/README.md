# SPEC-04 — Grupos de estudio y chat en tiempo real

Implementación de las tareas 4.1–4.4: entidades, Gateway, REST y conexión con React. La revisión `SPEC04-integracion-spec06` parte del main `17cd0fd`, que ya incluye la reorganización modular de Lau y SPEC-06 de Lourdes. Integra sus eventos y pantallas con SPEC-04 y SPEC-07; no sustituye los módulos del equipo.

## Alcance y límites

- Crear y descubrir grupos; filtrar por curso y modalidad; consultar grupos propios e integrantes.
- Solicitar ingreso, aprobar/rechazar, validar duplicados y cupos en una transacción.
- Abandonar, expulsar y transferir liderazgo. La salida conserva `group_members` con estado `left` o `kicked` y `left_at`, para el dominio de reseñas. Un expulsado puede solicitar nuevamente: necesita otra aprobación del líder.
- Chat privado para miembros activos: historial paginado, mensajes con ACK y reintentos sin duplicados.
- Extras solicitados para el chat: escritura, presencia por usuario con múltiples pestañas, reacciones, lecturas y respuestas a mensajes.
- Puente hacia SPEC-06 para ocultar mensajes y citas. El motor de moderación pertenece a esa SPEC; aquí no se implementa un filtro paralelo.

No se incorporan adjuntos, encuestas, mensajes privados, edición ni mensajes fijados. La eliminación por administración y la restauración por apelación se difunden después de la transacción mediante `content.visibility_changed`; el chat relee el estado saneado y emite `chat:message_updated` solo a miembros vigentes. No se añaden rutas de edición o eliminación para estudiantes.

Integración posterior solicitada: se confirmó que main ya contenía SPEC-01, SPEC-02 y SPEC-03 (esta última a través del PR #6). Se incorporó mediante merge el ajuste publicado `415de10` de SPEC-03 que admite `/auth/account` como alias de `/auth/me` al eliminar la cuenta, para compatibilidad con el frontend del equipo. Se conserva su autoría; no se implementa otro sistema de autenticación. El frontend incluye el ajuste correspondiente `859515b` y una ampliación visual de presentación/acceso, documentada en su carpeta `features/welcome/`. Main permanece intacto; se prepara un PR para revisión.

Actualización durante esta revisión: el equipo fusionó SPEC-05 y el ajuste de SPEC-03 en main `25df6c06882a75a148b0f4921036b8766aeac2d4` (PR #11/#12). Esa versión se incorporó a SPEC-04 mediante merge, conservando la implementación de reseñas del equipo; el frontend integra su main correspondiente `1da721f`. La conservación de `joined_at`/`left_at` se verifica mediante una reseña real posterior a una expulsión, sin modificar reglas de SPEC-05.

Los ajustes de integración registran `GroupMessagingModule` en `src/app.module.ts`, sin duplicar controladores de solicitudes/grupos. La entrega inicial se integró mediante PR #14. El main posterior `3a9d545` reorganiza los dominios del equipo bajo `src/modules/` y conserva los proveedores de grupos que utilizan publicaciones. La revisión `SPEC04-ajustes-integracion-final` parte de ese main y mantiene sus módulos; no incorpora contenedores.

## Decisiones frente al código real de main

Se conserva el stack y las versiones de las dependencias existentes. La ejecución usa Node y una conexión PostgreSQL directa, sin infraestructura de contenedores. Main usa NestJS 12/TypeScript 6 en backend y React 19/TypeScript 5.9 en frontend. El ajuste de integración corrige entradas duplicadas/incompletas del lock y añade al comando de build la normalización de rutas locales generadas por Swagger; no modifica `.env` ni reglas de otras SPEC.

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

Requisitos: Node compatible con main, PostgreSQL 16 instalado directamente y las dos ramas descargadas. Puede obtenerse PostgreSQL desde su [sitio oficial para Windows](https://www.postgresql.org/download/windows/). Debe estar iniciado; el usuario de preparación necesita permiso para crear las dos bases locales de demostración/pruebas. Estos comandos se ejecutan desde la raíz del backend en PowerShell.

El lock corregido permite instalar con `npm ci`, sin recurrir a instalaciones que lo ignoren:

```powershell
npm ci
npm run build
$env:SPEC04_DATABASE_URL='postgresql://postgres:TU_CLAVE_POSTGRES@127.0.0.1:5432/luminaul_spec04_demo'
node src/modules/group-messaging/tools/local.cjs prepare
node src/modules/group-messaging/tools/local.cjs serve
```

Sustituir `TU_CLAVE_POSTGRES` y el puerto por los de tu instalación; codificar los caracteres especiales de la contraseña como parte de la URL. Las credenciales de PostgreSQL son distintas de las cuentas de la aplicación. Backend de demostración: `http://127.0.0.1:8004`; documentación HTTP: `/docs`.

`local.cjs` exige `SPEC04_DATABASE_URL` para la demostración y `SPEC04_TEST_DATABASE_URL` para las pruebas. Solo admite las bases `luminaul_spec04_demo` y `luminaul_spec04_test`, respectivamente, en localhost, con el puerto configurable. Ejecuta el SQL inicial únicamente en una base vacía propia. Nunca apunta a Neon ni reinicia la base del equipo. No incorpora contraseñas predeterminadas para el servidor PostgreSQL.

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
| Administrador local | `spec04.admin@aloe.ulima.edu.pe` | `LuminaSpec04!2026` |

Las dos primeras pertenecen inicialmente a Taller de Software II; la tercera puede solicitar ingreso. La cuarta permite probar `/admin`, sin pertenencia automática al chat. Todas se crean exclusivamente por el helper en las bases locales de demostración/test, nunca en la nube; sus credenciales no se muestran en la interfaz. Usar ventanas o perfiles distintos para probarlas simultáneamente. El servidor de demostración crea su propio secreto JWT al arrancar: tras reiniciarlo hay que iniciar sesión otra vez.

## Integración con una base del equipo existente

Esta rama necesita el esquema v3 que ya está en main: grupos, membresías con estado e ID, solicitudes, mensajes, usuarios y perfiles. La extensión de SPEC-04 añade únicamente dos columnas de mensajes, índices, `message_reactions` y `group_read_markers`. No altera cuentas ni elimina datos.

Después de configurar la conexión habitual `DATABASE_URL`, compilar y aplicar solamente la extensión:

```powershell
npm run build
node src/modules/group-messaging/tools/migrate.cjs
node dist/main.js
```

El helper de migración lee la configuración existente, ejecuta `up` dentro de una transacción y es repetible; no registra una segunda infraestructura de migraciones. **No ejecutar `db:init`/`init-db.sql` sobre una base existente:** el SQL de main reinicia tablas. No se ha ejecutado esta migración en la nube del equipo.

El plugin Swagger puede dejar referencias absolutas a archivos TypeScript cuando la ruta de Windows contiene tildes. `scripts/normalize-openapi-paths.cjs`, ejecutado después de `nest build`, convierte exclusivamente los `require` absolutos que apuntan a `src` en rutas relativas al JavaScript correspondiente de `dist`. Utiliza el AST para decodificar Unicode y comprueba que el destino exista. No cambia fuentes, dependencias, paquetes externos ni contratos OpenAPI. Se mantiene el plugin y se verifica el arranque real con `npm run start:prod`, `/health` y `/docs-json`. Para desarrollo local sin ese plugin, el helper `serve` sigue utilizando `ts-node`.

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
$env:SPEC04_TEST_DATABASE_URL='postgresql://postgres:TU_CLAVE_POSTGRES@127.0.0.1:5432/luminaul_spec04_test'
node src/features/chat/tests/run-integration.mjs
```

La suite arranca servidores reales en 8005/5176, usa exclusivamente `luminaul_spec04_test` en tu PostgreSQL local, inicia tres usuarios con SPEC-01 y abre Edge headless mediante Playwright ya incluido en main. No instala ni inicia el motor de base de datos: PostgreSQL debe estar activo. `BROWSER_CHANNEL=chrome` permite otro navegador instalado. Puede separarse con `--network-only` o `--browser-only`.

Resultado del 1 de noviembre: 13 grupos de comprobaciones de REST/Socket.IO/navegador aprobados, 3 pruebas unitarias de presencia aprobadas y las 22 pruebas existentes `test/spec01-spec03.spec.ts` aprobadas sobre la base local de test. Se verificaron permisos, último cupo concurrente, reintentos concurrentes, fallo real de PostgreSQL sin mensajes fantasma, cursor estable, moderación de citas, expulsión, token revocado, reconexión, múltiples pestañas y móvil sin desbordamiento. Las capturas, logs y `results.json` se escriben en `frontend/analysis/spec04`, excluidos del commit. No constituyen pruebas de carga ni validación de un despliegue en la nube.

Después de adaptar la ejecución directa, se repitió la suite conjunta: los 13 grupos de comprobaciones pasaron con PostgreSQL 16.15 nativo en Windows. El backend de demostración también quedó comprobado con la instancia anterior de contenedores detenida. Los binarios, datos y credenciales locales no se incluyen en Git.

Después de integrar el main actualizado y la presentación pública, la suite conjunta suma 18 grupos aprobados, incluyendo una reseña real tras una expulsión y sus permisos/borrado lógico. También pasaron las 17 pruebas unitarias de SPEC-05 publicadas por el equipo. Esa comprobación confirma que la membresía histórica conservada por SPEC-04 puede utilizarse desde el módulo de reseñas integrado, sin duplicar sus reglas.

Referencias técnicas: [Gateways de NestJS](https://docs.nestjs.com/websockets/gateways), [garantías de entrega de Socket.IO](https://socket.io/docs/v4/delivery-guarantees/), [middleware de Socket.IO](https://socket.io/docs/v4/middlewares/).

Revisión posterior a la integración: base main `3a9d545`, incluyendo la reorganización modular de Lau (PR #15/#16) y SPEC-07. Las seis suites de Jest del equipo pasaron sus 188 pruebas con `DATABASE_URL` apuntando exclusivamente a la base local de test. Se verificaron también la instalación limpia con `npm ci`, el build estándar, el arranque compilado y su documentación OpenAPI. Se conservan AdministrationModule, sus notificaciones y el único bus EventEmitter2 del AppModule; los ajustes de esta revisión no modifican lógica de las demás SPEC.

## Integración de SPEC-06 y SPEC-07 — 2 de noviembre

Base de la revisión actual: main `17cd0fd`, incluyendo el motor y los contratos de Lourdes. Una ocultación automática y su registro se guardan en la misma transacción. Las denuncias de mensajes privados exigen pertenencia activa al grupo o rol de administrador de plataforma. La creación de apelaciones bloquea la fila de moderación para que dos envíos simultáneos produzcan una sola solicitud.

Las decisiones de SPEC-07 publican `content.visibility_changed` después de confirmar su transacción. El Gateway de SPEC-04 consulta el mensaje saneado, depura membresías/sesiones de la sala y difunde `chat:message_updated`. El frontend actualiza texto y citas tanto al restaurar como al eliminar. No se importa una entidad de otro módulo ni se crea otro bus de eventos.

Validación final: build de ambos proyectos, arranque compilado con `/health` y `/docs-json`, **200 pruebas en 8 suites del backend**, **44 del frontend** y **22 grupos de integración con PostgreSQL real y frontend compilado**, incluidos cuatro recorridos nuevos de moderación/administración. Los artefactos permanecen en `frontend/analysis/spec04/`. La prueba de filtro real complementa la prueba aislada del puente por IPC; no la sustituye por un mock del motor. El despliegue y la base en la nube no se han modificado.
