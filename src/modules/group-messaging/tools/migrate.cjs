const { resolve } = require("node:path");
const root = resolve(__dirname, "../../../..");
require(resolve(root, "node_modules/dotenv")).config({
  path: resolve(root, ".env"),
});
const { DataSource } = require(resolve(root, "node_modules/typeorm"));
const { ChatInteractions1762041600000 } = require(
  resolve(
    root,
    "dist/modules/group-messaging/migrations/1762041600000-ChatInteractions.js",
  ),
);

/** Aplica solo la extensión de SPEC-04 sobre la conexión configurada; no ejecuta init-db.sql. */
async function migrate() {
  if (!process.env.DATABASE_URL)
    throw new Error("Configura DATABASE_URL antes de ejecutar esta migración.");
  const db = new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL,
    synchronize: false,
  });
  await db.initialize();
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await new ChatInteractions1762041600000().up(runner);
    await runner.commitTransaction();
    console.log("Migración SPEC-04 aplicada sin reiniciar tablas existentes.");
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
    await db.destroy();
  }
}
void migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
