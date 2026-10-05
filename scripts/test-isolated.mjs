import 'dotenv/config';
import pg from 'pg';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Las suites heredadas borran registros. Nunca se ejecutan contra la base de demostración.
const local = new URL(process.env.DATABASE_URL || '');
if (!['127.0.0.1', 'localhost'].includes(local.hostname) || local.port !== '55434' || local.pathname !== '/luminaul_equipo')
  throw new Error('Esta prueba requiere la base local de compose.yaml (puerto 55434).');
const admin = new URL(local); admin.pathname = '/postgres';
const adminDb = new pg.Client({ connectionString: admin.href });
await adminDb.connect();
try {
  const result = await adminDb.query("SELECT 1 FROM pg_database WHERE datname='luminaul_equipo_test'");
  if (!result.rowCount) await adminDb.query('CREATE DATABASE luminaul_equipo_test');
} finally { await adminDb.end(); }
local.pathname = '/luminaul_equipo_test';
const db = new pg.Client({ connectionString: local.href });
await db.connect();
try { await db.query(readFileSync('init-db.sql', 'utf8')); } finally { await db.end(); }
mkdirSync('analysis/validation', { recursive: true });
const reports = [];
for (const runner of ['sprint1-runner', 'sprint2-join-requests-runner', 'auth-integration-runner', 'accounts-profile-runner']) {
  const result = spawnSync(process.execPath, ['node_modules/ts-node/dist/bin.js', `test/${runner}.ts`], {
    encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: local.href, MAIL_HOST: '127.0.0.1', MAIL_PORT: '11026', MAIL_SECURE: 'false', MAIL_USER: '', MAIL_PASSWORD: '' },
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  writeFileSync(`analysis/validation/${runner}.log`, output);
  const ok = result.status === 0 && !output.includes('Error crítico en suite');
  reports.push({ suite: runner, status: ok ? 'PASS' : 'FAIL' });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${runner}`);
  if (!ok) { console.error(output.slice(-6000)); process.exitCode = 1; break; }
}
writeFileSync('analysis/validation/suites.json', JSON.stringify({ database: 'luminaul_equipo_test', reports }, null, 2));
