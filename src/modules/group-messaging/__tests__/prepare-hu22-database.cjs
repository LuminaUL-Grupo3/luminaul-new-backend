const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

/** Solo inicializa una base NUEVA de pruebas HU22; nunca reinicializa una existente. */
async function prepare() {
  if (!process.env.TEST_HU22_DATABASE_URL) {
    throw new Error('Define TEST_HU22_DATABASE_URL con una base PostgreSQL local exclusiva de HU22.');
  }
  const target = new URL(process.env.TEST_HU22_DATABASE_URL);
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) ||
      !/^\/luminaul_spec04_hu22_test(?:_\d+)?$/.test(target.pathname)) {
    throw new Error('Se rechaza la conexión: no corresponde a una base local exclusiva de pruebas HU22.');
  }
  const name = target.pathname.slice(1);
  const adminUrl = new URL(target.href);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 5000 });
  await admin.connect();
  let created = false;
  try {
    if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount) {
      await admin.query(`CREATE DATABASE "${name}"`);
      created = true;
    }
  } finally {
    await admin.end();
  }
  const db = new Client({ connectionString: target.href, connectionTimeoutMillis: 5000 });
  await db.connect();
  try {
    if (created) {
      const root = path.resolve(__dirname, '../../../..');
      await db.query(fs.readFileSync(path.join(root, 'database/init-db.sql'), 'utf8'));
    }
    const schema = await db.query("SELECT to_regclass('public.users') AS users, to_regclass('public.join_requests') AS requests");
    if (!schema.rows[0].users || !schema.rows[0].requests) {
      throw new Error('La base existente no tiene el esquema requerido. No se reinicializa automáticamente.');
    }
    console.log(`Base local HU22 lista: ${name}; creada en esta ejecución: ${created}.`);
  } finally {
    await db.end();
  }
}
prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
