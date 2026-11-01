import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

async function runManualMigration() {
  let dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) {
    console.error('[ERROR] DATABASE_URL no está definida en el archivo .env');
    process.exit(1);
  }

  if (dbUrl.startsWith('postgresql+psycopg://')) {
    dbUrl = dbUrl.replace('postgresql+psycopg://', 'postgresql://');
  } else if (dbUrl.startsWith('postgres://')) {
    dbUrl = dbUrl.replace('postgres://', 'postgresql://');
  }

  const sqlPath = path.resolve(__dirname, '../init-db.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error(`[ERROR] No se encontró el archivo SQL en: ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('[INFO] Conectando a PostgreSQL para ejecutar la migración manual...');
  const dataSource = new DataSource({
    type: 'postgres',
    url: dbUrl,
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log('[INFO] Ejecutando script init-db.sql (SPECS.md v3.0.0)...');
    await dataSource.query(sql);

    console.log('[OK] Inicialización de base de datos completada con éxito.');
    console.log('     17 tablas, índices parciales, extensiones y semillas oficiales (SPECS.md & AGENTS.md) listas.');
  } catch (err: any) {
    console.error('[ERROR] Error al ejecutar la migración manual:', err.message);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

runManualMigration();
