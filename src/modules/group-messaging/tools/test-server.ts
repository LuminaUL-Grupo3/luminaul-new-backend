import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { AppModule } from "../../../app.module";
import { AllExceptionsFilter } from "../../../common/filters/http-exception.filter";

/** Servidor de integración real; el canal IPC permite simular el resultado de SPEC-06 solo en la base de pruebas. */
async function bootstrapTest(): Promise<void> {
  const target = new URL(process.env.DATABASE_URL || "");
  if (
    process.env.NODE_ENV !== "test" ||
    target.port !== "55436" ||
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.pathname !== "/luminaul_spec04_test"
  )
    throw new Error(
      "Este servidor solo admite la base local de pruebas SPEC-04.",
    );
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("LuminaUL integración")
      .setVersion("1")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup("docs", app, document);
  await app.listen(Number(process.env.PORT || 8005), "127.0.0.1");
  const db = app.get(DataSource),
    events = app.get(EventEmitter2);
  /** Emula al moderador interno sin publicar rutas de prueba o puertas de acceso en la API. */
  async function receive(raw: unknown): Promise<void> {
    if (
      !raw ||
      typeof raw !== "object" ||
      !("kind" in raw) ||
      !("requestId" in raw) ||
      typeof raw.requestId !== "string"
    )
      return;
    if (
      raw.kind !== "moderate" ||
      !("groupId" in raw) ||
      !("messageId" in raw) ||
      typeof raw.groupId !== "string" ||
      typeof raw.messageId !== "string"
    )
      return;
    try {
      await db.query(
        "UPDATE group_messages SET status='hidden' WHERE id=$1 AND group_id=$2",
        [raw.messageId, raw.groupId],
      );
      await events.emitAsync("chat:message_hidden", {
        groupId: raw.groupId,
        messageId: raw.messageId,
      });
      process.send?.({ requestId: raw.requestId, success: true });
    } catch {
      process.send?.({ requestId: raw.requestId, success: false });
    }
  }
  process.on("message", (raw) => {
    void receive(raw);
  });
  /** Cierra conexiones de la propia prueba para que no quede un servidor huérfano. */
  async function close(): Promise<void> {
    app.getHttpServer().closeAllConnections();
    await app.close();
    process.disconnect?.();
  }
  process.once("SIGTERM", () => {
    void close();
  });
  process.once("SIGINT", () => {
    void close();
  });
  process.send?.({ ready: true });
}
void bootstrapTest().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
