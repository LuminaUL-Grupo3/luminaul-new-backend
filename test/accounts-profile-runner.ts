import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

async function run() {
  const database = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1'].includes(database.hostname) || database.port !== '55434' || database.pathname !== '/luminaul_equipo_test')
    throw new Error('Ejecuta npm run test:integration para usar la base aislada.');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  app.useStaticAssets(resolve('uploads'), { prefix: '/uploads/' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl(), db = app.get(DataSource), checks: string[] = [], files: string[] = [];
  const prefix = `integracion.${Date.now()}`, email = `${prefix}@aloe.ulima.edu.pe`, otherEmail = `${prefix}.otro@aloe.ulima.edu.pe`;
  const password = 'RegistroLocal2026!';
  async function request(path: string, method = 'GET', body?: any, cookie?: string) {
    const multipart = body instanceof FormData;
    const response = await fetch(base + path, { method, headers: { ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? multipart ? body : JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() as any, cookie: (response.headers.get('set-cookie') || '').split(';')[0] };
  }
  async function message(recipient: string, subject: string) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const inbox = await (await fetch('http://127.0.0.1:8026/api/v1/messages?limit=100')).json() as any;
      const mail = inbox.messages.find((m: any) => m.To.some((to: any) => to.Address === recipient) && m.Subject === subject);
      if (mail) return await (await fetch(`http://127.0.0.1:8026/api/v1/message/${mail.ID}`)).json() as any;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('No llegó el correo al buzón local.');
  }
  async function code(recipient: string) { return (await message(recipient, 'Verifica tu cuenta de LuminaUL')).Text.match(/\b\d{6}\b/)[0] as string; }
  const pass = (text: string) => { checks.push(text); console.log(`PASS ${text}`); };
  try {
    for (const path of ['/profiles/me', '/reviews/me']) assert.equal((await request(path)).status, 401);
    const invalid = await request('/auth/register', 'POST', { name: 'X', email: 'fuera@gmail.com', password: 'corta' });
    assert.equal(invalid.status, 400);
    const created = await request('/auth/register', 'POST', { name: '  Usuario nuevo  ', email: ` ${email.toUpperCase()} `, password, role: 'admin' });
    assert.equal(created.status, 201); assert.equal(created.data.email_sent, true); assert.equal(created.data.password, undefined);
    const [account] = await db.query('SELECT * FROM users WHERE email=$1', [email]);
    assert.equal(account.role, 'student'); assert.equal(account.is_verified, false); assert.match(account.password_hash, /^\$2/);
    assert.equal((await db.query('SELECT name FROM profiles WHERE user_id=$1', [account.id]))[0].name, 'Usuario nuevo');
    assert.equal((await request('/auth/register', 'POST', { name: 'Duplicado', email: email.toUpperCase(), password })).status, 409);
    assert.equal((await request('/auth/login', 'POST', { email, password })).status, 403);
    const firstCode = await code(email);
    assert.notEqual(account.verification_token, firstCode);
    pass('Registro institucional atómico, rol estudiante, contraseña hash y correo SMTP real sin código en la respuesta');
    const wrong = firstCode === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt++) assert.equal((await request('/auth/verify', 'POST', { email, code: wrong })).status, 400);
    const blocked = await request('/auth/verify', 'POST', { email, code: firstCode });
    assert.match(blocked.data.message, /límite/);
    assert.equal((await db.query('SELECT verification_attempts FROM users WHERE id=$1', [account.id]))[0].verification_attempts, 5);
    assert.equal((await request('/auth/verification', 'POST', { email })).status, 200);
    const freshCode = await code(email);
    await db.query('UPDATE users SET verification_token_expires_at=$2 WHERE id=$1', [account.id, new Date(Date.now() - 60_000)]);
    assert.match((await request('/auth/verify', 'POST', { email, code: freshCode })).data.message, /venció/);
    await request('/auth/verification', 'POST', { email });
    assert.equal((await request('/auth/verify', 'POST', { email, code: await code(email) })).status, 200);
    assert.equal((await request('/auth/verify', 'POST', { email, code: await code(email) })).status, 400);
    const login = await request('/auth/login', 'POST', { email, password }), cookie = login.cookie;
    assert.equal(login.status, 200); assert.equal(login.data.name, 'Usuario nuevo');
    pass('Verificación con caducidad, cinco intentos, reenvío y consumo único antes del login');
    await request('/auth/register', 'POST', { name: 'Otra persona', email: otherEmail, password });
    await request('/auth/verify', 'POST', { email: otherEmail, code: await code(otherEmail) });
    const otherLogin = await request('/auth/login', 'POST', { email: otherEmail, password });
    const otherCookie = otherLogin.cookie;
    const empty = await request('/profiles/me', 'GET', undefined, cookie);
    assert.equal(empty.status, 200); assert.equal(empty.data.major, ''); assert.equal(empty.data.academic_cycle, null);
    assert.equal(empty.data.rating, null); assert.deepEqual(empty.data.skills, []);
    const update = { name: 'Usuario de integración', bio: 'Aprendiendo con mi grupo.', major: 'Ingeniería de Sistemas', academic_cycle: 4, skills: ['TypeScript', 'Trabajo en equipo'], interests: ['Software'] };
    assert.equal((await request('/profiles/me', 'PUT', { ...update, academic_cycle: 0 }, cookie)).status, 400);
    assert.equal((await request('/profiles/me', 'PUT', update, cookie)).status, 200);
    const profile = await request('/profiles/me', 'GET', undefined, cookie);
    assert.equal(profile.data.name, update.name); assert.deepEqual(profile.data.skills, update.skills.sort());
    assert.equal((await request('/auth/me', 'GET', undefined, cookie)).data.name, update.name);
    assert.equal((await request(`/profiles/${account.id}`, 'GET', undefined, otherCookie)).data.bio, update.bio);
    const otherProfile = await request('/profiles/me', 'GET', undefined, otherCookie);
    assert.equal(otherProfile.data.name, 'Otra persona');
    pass('Perfil real, catálogos persistentes, sin valores inventados y cambios limitados al propietario');
    const slot = { day_of_week: 1, start_time: '09:00', end_time: '10:00' };
    assert.equal((await request('/availability', 'POST', { ...slot, end_time: '08:00' }, cookie)).status, 400);
    assert.equal((await request('/availability', 'POST', { ...slot, day_of_week: 8 }, cookie)).status, 400);
    assert.equal((await request('/availability', 'POST', { ...slot, start_time: '25:00' }, cookie)).status, 400);
    const race = await Promise.all([request('/availability', 'POST', slot, cookie), request('/availability', 'POST', slot, cookie)]);
    assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
    const slotId = race.find(r => r.status === 201)!.data.id;
    assert.equal((await request('/availability', 'POST', { ...slot, start_time: '10:00', end_time: '11:00' }, cookie)).status, 201);
    assert.equal((await request(`/availability/${slotId}`, 'PUT', { ...slot, day_of_week: 2 }, otherCookie)).status, 404);
    assert.equal((await request(`/availability/${slotId}`, 'DELETE', undefined, otherCookie)).status, 404);
    assert.equal((await request(`/availability/${slotId}`, 'PUT', { ...slot, day_of_week: 2 }, cookie)).status, 200);
    assert.equal((await request('/profiles/me', 'GET', undefined, cookie)).data.availability.length, 2);
    assert.equal((await request(`/availability/${slotId}`, 'DELETE', undefined, cookie)).status, 200);
    pass('Horario: CRUD, límites, rangos, franjas contiguas, cruce concurrente y autorización');
    const bad = new FormData(); bad.append('photo', new Blob(['not png'], { type: 'image/png' }), 'foto.png');
    assert.equal((await request('/profiles/me/photo', 'POST', bad, cookie)).status, 400);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6x2cAAAAASUVORK5CYII=', 'base64');
    const form = new FormData(); form.append('photo', new Blob([png], { type: 'image/png' }), '../../foto.png');
    const photo = await request('/profiles/me/photo', 'POST', form, cookie);
    assert.equal(photo.status, 201); assert.match(photo.data.photo_url, /^\/uploads\/profiles\/[a-f0-9-]+\.png$/);
    files.push(resolve(`.${photo.data.photo_url}`));
    const uploaded = await fetch(base + photo.data.photo_url);
    assert.equal(uploaded.status, 200); assert.deepEqual(Buffer.from(await uploaded.arrayBuffer()), png);
    assert.equal((await request('/profiles/me', 'GET', undefined, cookie)).data.photo_url, photo.data.photo_url);
    pass('Foto validada, nombre generado, guardada y servida sin aceptar archivos arbitrarios');
    assert.deepEqual((await request(`/profiles/${account.id}/reviews`, 'GET', undefined, cookie)).data, []);
    assert.equal((await request(`/profiles/${account.id}/review-eligibility`, 'GET', undefined, otherCookie)).data.allowed, false);
    assert.equal((await request('/reviews', 'POST', { reviewed_user_id: account.id, rating: 5, comment: 'Buen compañero' }, otherCookie)).status, 403);
    const [admin] = await db.query("SELECT id FROM users WHERE email='administrador.prueba@aloe.ulima.edu.pe'");
    const groupId = randomUUID();
    await db.query('INSERT INTO groups(id,name,admin_id) VALUES($1,$2,$3)', [groupId, 'Grupo de reseñas de integración', admin.id]);
    await db.query("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'member')", [groupId, account.id, otherLogin.data.id]);
    assert.equal((await request(`/profiles/${account.id}/review-eligibility`, 'GET', undefined, otherCookie)).data.allowed, true);
    assert.equal((await request('/reviews', 'POST', { reviewed_user_id: account.id, rating: 5, comment: 'Buen compañero' }, otherCookie)).status, 201);
    const received = await request(`/profiles/${account.id}/reviews`, 'GET', undefined, cookie);
    assert.equal(received.data.length, 1); assert.equal((await request('/profiles/me', 'GET', undefined, cookie)).data.rating, 5);
    const reviewId = received.data[0].id;
    assert.equal((await request(`/reviews/${reviewId}`, 'PUT', { rating: 4, comment: 'Comentario actualizado' }, cookie)).status, 404);
    assert.equal((await request(`/reviews/${reviewId}`, 'PUT', { rating: 4, comment: 'Comentario actualizado' }, otherCookie)).status, 200);
    assert.equal((await request(`/reviews/${reviewId}`, 'DELETE', undefined, otherCookie)).status, 200);
    assert.equal((await request('/profiles/me', 'GET', undefined, cookie)).data.rating, null);
    await db.query('DELETE FROM groups WHERE id=$1', [groupId]);
    pass('Reseñas reales: solo compañeros de grupo, autoría y promedio recalculado');
    const known = await request('/auth/recover', 'POST', { email });
    const unknown = await request('/auth/recover', 'POST', { email: `${prefix}.inexistente@aloe.ulima.edu.pe` });
    assert.deepEqual(known.data, unknown.data);
    const resetText = (await message(email, 'Recupera tu acceso a LuminaUL')).Text;
    const token = resetText.match(/token=([a-f0-9]{64})/)[1];
    assert.equal((await request('/auth/reset', 'POST', { token, password: 'NuevaLocal2026!' })).status, 200);
    assert.equal((await request('/auth/reset', 'POST', { token, password })).status, 400);
    assert.equal((await request('/auth/me', 'GET', undefined, cookie)).status, 401);
    assert.equal((await request('/auth/login', 'POST', { email, password })).status, 401);
    const newLogin = await request('/auth/login', 'POST', { email, password: 'NuevaLocal2026!' });
    assert.equal(newLogin.status, 200);
    assert.equal((await request('/auth/password', 'PUT', { current_password: 'incorrecta', password }, newLogin.cookie)).status, 400);
    assert.equal((await request('/auth/password', 'PUT', { current_password: 'NuevaLocal2026!', password }, newLogin.cookie)).status, 200);
    assert.equal((await request('/auth/me', 'GET', undefined, newLogin.cookie)).status, 401);
    pass('Recuperación por correo, enlace de un uso y revocación de todas las sesiones al cambiar contraseña');
    const missing = await request('/ruta-no-publicada');
    assert.equal(missing.status, 404); assert.doesNotMatch(missing.data.message, /Cannot GET/);
    pass('Errores de rutas sin mensajes técnicos de Express');
    mkdirSync('analysis/validation', { recursive: true });
    writeFileSync('analysis/validation/accounts-profile.json', JSON.stringify({ status: 'PASS', checks }, null, 2));
  } finally {
    for (const file of files) await unlink(file).catch(() => {});
    // Solo registros de esta ejecución y exclusivamente dentro de la base de pruebas.
    try {
      await db.query('DELETE FROM reviews WHERE reviewer_id IN (SELECT id FROM users WHERE email=$1 OR email=$2) OR reviewed_user_id IN (SELECT id FROM users WHERE email=$1 OR email=$2)', [email, otherEmail]);
      await db.query('DELETE FROM users WHERE email=$1 OR email=$2', [email, otherEmail]);
    }
    finally {
      app.getHttpServer().closeAllConnections();
      await app.close();
    }
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
