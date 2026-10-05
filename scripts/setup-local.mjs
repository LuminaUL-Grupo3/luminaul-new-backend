import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.env')) {
  writeFileSync('.env', [
    'NODE_ENV=development', 'PORT=8000',
    'DATABASE_URL=postgresql://luminaul:luminaul_equipo_local@127.0.0.1:55434/luminaul_equipo',
    `JWT_SECRET=${randomBytes(48).toString('hex')}`, 'WEB_ORIGIN=http://localhost:5173',
    'MAIL_HOST=127.0.0.1', 'MAIL_PORT=11026', 'MAIL_SECURE=false', 'MAIL_FROM=LuminaUL <no-reply@luminaul.local>', '',
  ].join('\n'));
  console.log('Configuración local creada en .env.');
} else console.log('Se conserva la configuración .env existente.');
