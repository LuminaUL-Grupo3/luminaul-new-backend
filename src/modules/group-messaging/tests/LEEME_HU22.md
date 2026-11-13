# Pruebas de la HU 2.2

La rama SPEC04-hu22-fluidez-pruebas parte del main 9354855. Mantiene Controller-Service-Repository y completa la notificación dirigida al solicitante mediante notification.send, ya consumido por SPEC-07. No cambia el esquema ni introduce dependencias de aplicación.

## Ejecución

Desde la raíz del backend, con las dependencias del proyecto instaladas:

```powershell
npm test
npx vitest run --config src/modules/group-messaging/tests/vitest.hu22.config.mts --coverage
```

El primer comando ejecuta la suite unitaria del equipo. La integración de HU22 se omite si TEST_HU22_DATABASE_URL no está definida. Para incluirla, configurar esa variable con una base PostgreSQL de prueba inicializada con database/init-db.sql. El nombre debe ser luminaul_spec04_hu22_test o luminaul_spec04_hu22_test_ seguido de dígitos y el servidor debe ser localhost/127.0.0.1. El ejecutor rechaza otros destinos. No usar la base del equipo ni ejecutar el script inicial sobre una base con datos.

La integración inicia una aplicación Nest completa con el prefijo y los pipes HTTP compartidos; crea fixtures con UUID únicos y los retira al finalizar. El caso de rollback agrega un trigger temporal, limitado a la solicitud de prueba, que siempre elimina en finally. Comprueba persistencia de la notificación, permisos, estados, último cupo y dos aprobaciones concurrentes. No necesita Docker ni llamadas a OpenAI.

## Evidencia del 13 de noviembre de 2026

- 18 pruebas específicas de repositorio/servicio en hu22.decide.spec.ts.
- 13 casos HTTP/PostgreSQL en hu22.integration.spec.ts.
- 8 pruebas existentes de servicio y presencia. Resultado de la suite SPEC04: 39 aprobadas.
- Regresión general: 271 aprobadas; 13 de integración omitidas en la ejecución sin variable. Esas 13 sí se ejecutaron en la suite específica.
- Callback GroupsRepository.decide: seis if explícitos, complejidad 7. V8: 20/20 sentencias y 12/12 resultados de ramas dentro del método.
- GroupMessagingService.decide: 4/4 sentencias y 6/6 resultados de ramas dentro del método.
- La cobertura del conjunto de los dos archivos completos es distinta: líneas 32.39%, sentencias 32.19%, ramas 28.57%. Contienen otras HU fuera de este conjunto de pruebas.

Los resultados resumidos se conservan en evidence/hu22-resultados.json. Vitest genera el detalle y el informe HTML en coverage/hu22. El entorno local de esta revisión ejecutó Vitest 4.1.10 y unplugin-swc 2.0.0 en una carpeta de herramientas aislada; package.json y package-lock.json del equipo se conservaron. La suite nueva utiliza la misma API de Vitest que las pruebas ya integradas.

## Límites

La entrega HTTP acredita la decisión confirmada. El listener de notificaciones usa eventos en memoria y registra errores de persistencia; no implementa una cola duradera ni una garantía de entrega ante caída del proceso. Las pruebas demuestran el flujo normal y el caso de escritura fallida, no certifican toda la seguridad o rendimiento del producto.
