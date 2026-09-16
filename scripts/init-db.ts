import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

async function runManualMigration() {
  let dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) {
    console.error('❌ Error: DATABASE_URL no está definida en el archivo .env');
    process.exit(1);
  }

  if (dbUrl.startsWith('postgresql+psycopg://')) {
    dbUrl = dbUrl.replace('postgresql+psycopg://', 'postgresql://');
  } else if (dbUrl.startsWith('postgres://')) {
    dbUrl = dbUrl.replace('postgres://', 'postgresql://');
  }

  const sqlPath = path.resolve(__dirname, '../init-db.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ Error: No se encontró el archivo SQL en: ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('🔄 Conectando a PostgreSQL para ejecutar la migración manual...');
  const dataSource = new DataSource({
    type: 'postgres',
    url: dbUrl,
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log('📦 Ejecutando script init-db.sql...');
    await dataSource.query(sql);
    console.log('✅ Migración manual completada con éxito.');
    console.log('   Tablas (courses, users, profiles, groups, publications) y datos iniciales listos.');
  } catch (err: any) {
    console.error('❌ Error al ejecutar la migración manual:', err.message);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

runManualMigration();
