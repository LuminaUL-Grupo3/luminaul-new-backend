# Notificaciones privadas: verificación

Se reutilizan EventEmitter2, la tabla de notificaciones y el Gateway de Socket.IO. No se agrega infraestructura, Docker, una migración ni dependencias. Los controladores REST mantienen su contrato.

## Ejecución

Desde backend, configurar TEST_NOTIFICATIONS_DATABASE_URL con la URL de una base PostgreSQL local exclusiva para pruebas. Se admite únicamente un nombre luminaul_spec04_hu22_test o luminaul_spec04_hu22_test_ seguido de dígitos. Preparar su esquema con los scripts del proyecto antes de ejecutar:

```powershell
node node_modules/vitest/vitest.mjs run --config test/vitest.notifications.config.mts
```

Sin la variable, los 11 casos quedan omitidos. No apuntar a la base de demostración o producción. Los casos crean usuarios, grupo y contenido propios y eliminan esos registros al terminar. No requieren OpenAI ni correo real.

## Casos ejecutados

1. Socket anónimo rechazado.
2. Nueva solicitud: persistencia y entrega exclusiva al líder.
3. Aceptación: aviso exclusivo al solicitante.
4. Lectura sincronizada entre conexiones y rechazo de lectura ajena.
5. Reporte: recibo al denunciante y aviso a administradores, sin avisar al denunciado antes de resolver.
6. Resolución: aviso al denunciante y al autor cuando se retira contenido.
7. Moderación léxica real: ocultamiento y aviso al autor.
8. Apelación: aviso a administración y resultado al alumno.
9. Suspensión: motivo antes de desconectar y HTTP 401 posterior.
10. Reactivación: acceso con sesión nueva y rechazo del token anterior.
11. Reconexión: recuperación del historial persistido.

Resultado: 11/11 aprobados. La ejecución completa del backend obtuvo 295/295: 271 pruebas existentes, 13 de HU 2.2 con PostgreSQL/HTTP y estas 11 de notificaciones. El resumen no equivale a cobertura de líneas ni a una auditoría de seguridad.

La prueba de suspensión separa temporalmente la emisión del token y la suspensión; no certifica el caso límite de suspensión/reactivación en el mismo segundo de SPEC01. El caso de moderación valida la estrategia léxica, no la precisión de un proveedor externo.

## Flujo

Operación confirmada → notification.send / notification.administrators → listener → guardar notificación → notification.created → validar sesión → room:user:ID → notification:new. La lectura emite notification:read. La suspensión utiliza account:suspended y desconecta, sin habilitar acceso a la cuenta suspendida.

Las salas personales se asignan en el servidor desde la identidad autenticada. No se aceptan destinatarios arbitrarios desde el cliente. El bus y el adaptador actual trabajan en una instancia; no se añade un outbox ni una garantía de entrega distribuida.
