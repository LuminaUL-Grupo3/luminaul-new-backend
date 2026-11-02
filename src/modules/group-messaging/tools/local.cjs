const { resolve } = require("node:path");
const { readFileSync } = require("node:fs");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const root = resolve(__dirname, "../../../..");
const { DataSource } = require(resolve(root, "node_modules/typeorm"));
const { hash } = require(resolve(root, "node_modules/bcryptjs"));

/** Solo prepara la base exclusiva de SPEC-04; jamás acepta Neon ni la base anterior del proyecto. */
async function prepare(test = false) {
  const name = test ? "luminaul_spec04_test" : "luminaul_spec04_demo";
  const url = new URL(
    process.env.SPEC04_DATABASE_URL ||
      `postgresql://postgres:spec04_local_only@127.0.0.1:55436/${name}`,
  );
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== "55436" ||
    url.pathname !== `/${name}`
  )
    throw new Error("Se requiere la base local aislada de SPEC-04 en 55436.");
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new DataSource({ type: "postgres", url: adminUrl.href });
  await admin.initialize();
  try {
    const databases = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      [name],
    );
    if (!databases.length) await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.destroy();
  }
  const db = new DataSource({ type: "postgres", url: url.href });
  await db.initialize();
  try {
    const [state] = await db.query(
      "SELECT to_regclass('public.users') AS users",
    );
    // init-db.sql de main reinicia tablas: se usa exclusivamente al crear esta base vacía.
    if (!state.users)
      await db.query(readFileSync(resolve(root, "init-db.sql"), "utf8"));
    const { ChatInteractions1762041600000 } = require(
      resolve(
        root,
        "dist/modules/group-messaging/migrations/1762041600000-ChatInteractions.js",
      ),
    );
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await new ChatInteractions1762041600000().up(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
    const passwordHash = await hash("LuminaSpec04!2026", 10);
    const users = [
      [
        "4a040000-0000-4000-8000-000000000001",
        "spec04.lider@aloe.ulima.edu.pe",
        "Líder de prueba",
      ],
      [
        "4a040000-0000-4000-8000-000000000002",
        "spec04.usuario@aloe.ulima.edu.pe",
        "Usuario de prueba",
      ],
      [
        "4a040000-0000-4000-8000-000000000003",
        "spec04.otro@aloe.ulima.edu.pe",
        "Otra persona",
      ],
    ];
    for (const [id, email, displayName] of users) {
      await db.query(
        `INSERT INTO users(id,email,password_hash,name,role,status,is_verified,tokens_valid_after)
        VALUES($1,$2,$3,$4,'student','active',true,NOW()-INTERVAL '1 second') ON CONFLICT(id)
        DO UPDATE SET password_hash=$3,name=$4,status='active',is_verified=true`,
        [id, email, passwordHash, displayName],
      );
      await db.query(
        "INSERT INTO profiles(user_id,name) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING",
        [id, displayName],
      );
    }
    const groupId = "4b040000-0000-4000-8000-000000000001";
    await db.query(
      `INSERT INTO groups(id,name,description,course_code,leader_id,admin_id,meeting_mode,meeting_shift,max_capacity)
      VALUES($1,'Taller de Software II','Coordinamos prácticas y compartimos lo que aprendemos.','ISW2',$2,$2,'virtual','tarde',6)
      ON CONFLICT(id) DO NOTHING`,
      [groupId, users[0][0]],
    );
    for (const [index, [id]] of users.entries()) {
      if (index === 2) continue;
      await db.query(
        `INSERT INTO group_members(group_id,user_id,role,status) VALUES($1,$2,$3,'active') ON CONFLICT(group_id,user_id) DO NOTHING`,
        [groupId, id, index === 0 ? "leader" : "member"],
      );
    }
    return url.href;
  } finally {
    await db.destroy();
  }
}

/** Ejecuta main con las variables aisladas sin crear ni modificar el .env compartido. */
async function run() {
  const command = process.argv[2] || "prepare",
    test = process.argv.includes("--test");
  const databaseUrl = await prepare(test);
  if (command === "prepare") {
    console.log(
      "Base local SPEC-04 preparada; no se modificaron bases externas.",
    );
    return;
  }
  if (command !== "serve") throw new Error("Usa prepare o serve.");
  const child = spawn(
    process.execPath,
    ["-r", "ts-node/register", "src/main.ts"],
    {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        NODE_ENV: "development",
        DATABASE_URL: databaseUrl,
        JWT_SECRET:
          process.env.SPEC04_JWT_SECRET || randomBytes(48).toString("hex"),
        PORT: process.env.SPEC04_PORT || "8004",
        WEB_ORIGIN:
          process.env.WEB_ORIGIN ||
          "http://localhost:5175,http://127.0.0.1:5175",
      },
    },
  );
  child.on("exit", (code) => {
    process.exitCode = code || 0;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => child.kill());
}
if (require.main === module)
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { prepare };
