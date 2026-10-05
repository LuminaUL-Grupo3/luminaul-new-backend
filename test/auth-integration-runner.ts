import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { LOCAL_GROUP, LOCAL_USERS, LOCAL_PASSWORD } from '../scripts/seed-local';
import { PasswordHasher } from '../src/auth/password-hasher';

async function run() {
  if (new URL(process.env.DATABASE_URL || '').pathname !== '/luminaul_equipo_test')
    throw new Error('Ejecuta npm run test:integration para usar una base aislada.');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl(), db = app.get(DataSource), checks: string[] = [];
  async function request(path: string, method = 'GET', body?: unknown, cookie?: string) {
    const response = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() as any, cookie: response.headers.get('set-cookie') || '' };
  }
  async function login(email: string) {
    const result = await request('/auth/login', 'POST', { email, password: LOCAL_PASSWORD });
    assert.equal(result.status, 200);
    return { ...result, cookie: result.cookie.split(';')[0] };
  }
  const pass = (text: string) => { checks.push(text); console.log(`PASS ${text}`); };
  try {
    const hash = await new PasswordHasher().hash(LOCAL_PASSWORD);
    for (const [id, email, name] of [[LOCAL_USERS.student, 'usuario.prueba@aloe.ulima.edu.pe', 'Usuario'], [LOCAL_USERS.admin, 'administrador.prueba@aloe.ulima.edu.pe', 'Administrador'], [LOCAL_USERS.other, 'ana.prueba@aloe.ulima.edu.pe', 'Ana Torres']]) {
      await db.query(`INSERT INTO users(id,email,password_hash,role,status,is_verified) VALUES($1,$2,$3,'student','active',true)
        ON CONFLICT(id) DO UPDATE SET password_hash=$3,status='active',is_verified=true`, [id,email,hash]);
      await db.query(`INSERT INTO profiles(user_id,name) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET name=$2`,[id,name]);
    }
    await db.query(`UPDATE users SET role='admin' WHERE id=$1`,[LOCAL_USERS.admin]);
    await db.query(`INSERT INTO groups(id,name,max_capacity,admin_id) VALUES($1,'Grupo de integración',3,$2)
      ON CONFLICT(id) DO UPDATE SET name='Grupo de integración',max_capacity=3,deleted_at=NULL`,[LOCAL_GROUP,LOCAL_USERS.admin]);
    await db.query('DELETE FROM join_requests WHERE group_id=$1',[LOCAL_GROUP]);
    await db.query('DELETE FROM group_members WHERE group_id=$1',[LOCAL_GROUP]);
    await db.query(`INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'admin')`,[LOCAL_GROUP,LOCAL_USERS.admin]);

    for (const path of ['/auth/me','/groups','/join-requests/me']) assert.equal((await request(path)).status,401);
    assert.equal((await request(`/groups/${LOCAL_GROUP}/join-requests`, 'POST', { message: 'Hola' })).status,401);
    pass('Rutas personales protegidas sin usuario de demostración');
    assert.equal((await request('/auth/login','POST',{email:'externo@gmail.com',password:'x'})).status,400);
    assert.equal((await request('/auth/login','POST',{email:'usuario.prueba@aloe.ulima.edu.pe',password:''})).status,400);
    assert.equal((await request('/auth/login','POST',{email:'usuario.prueba@aloe.ulima.edu.pe',password:'á'.repeat(40)})).status,400);
    pass('Validación HTTP de correo, contraseña vacía y límite bcrypt');
    for (const email of ['usuario.prueba@aloe.ulima.edu.pe','inexistente@aloe.ulima.edu.pe']) {
      const invalid = await request('/auth/login','POST',{email,password:'incorrecta'});
      assert.equal(invalid.status,401); assert.equal(invalid.data.message,'Correo o contraseña incorrectos');
    }
    pass('Credenciales incorrectas nunca inician sesión');
    const full = await request('/auth/login','POST',{email:'  USUARIO.PRUEBA@ALOE.ULIMA.EDU.PE  ',password:LOCAL_PASSWORD});
    assert.equal(full.status,200); assert.match(full.cookie,/HttpOnly/i); assert.match(full.cookie,/SameSite=Lax/i);
    assert.equal(full.data.id,LOCAL_USERS.student); assert.equal(full.data.password_hash,undefined); assert.equal(full.data.token,undefined);
    const student = { cookie: full.cookie.split(';')[0] }, admin = await login('administrador.prueba@aloe.ulima.edu.pe'), other = await login('ana.prueba@aloe.ulima.edu.pe');
    assert.equal(admin.data.role,'admin'); assert.equal((await request('/auth/me','GET',undefined,student.cookie)).data.name,'Usuario');
    pass('Login real, correo normalizado, cookie HTTPOnly y consulta de sesión');

    assert.equal((await request(`/groups/${LOCAL_GROUP}`,'GET',undefined,student.cookie)).data.my_status,'none');
    assert.equal((await request(`/groups/${LOCAL_GROUP}/join-requests`,'POST',{message:'  '},student.cookie)).status,400);
    const created = await request(`/groups/${LOCAL_GROUP}/join-requests`,'POST',{message:'  Me gustaría estudiar con el grupo.  ',requester_id:LOCAL_USERS.admin},student.cookie);
    assert.equal(created.status,201); assert.equal(created.data.request.requester.user_id,LOCAL_USERS.student);
    assert.equal(created.data.request.message,'Me gustaría estudiar con el grupo.');
    assert.equal((await request(`/groups/${LOCAL_GROUP}/join-requests`,'POST',{message:'Otra solicitud'},student.cookie)).status,409);
    assert.equal((await request(`/groups/${LOCAL_GROUP}`,'GET',undefined,student.cookie)).data.my_status,'pending');
    pass('Solicitud real, identidad de sesión, mensaje validado y duplicado bloqueado');
    assert.equal((await request('/join-requests/me','GET',undefined,student.cookie)).data.total,0);
    const pending = await request('/join-requests/me','GET',undefined,admin.cookie);
    assert.equal(pending.data.requests.find((r: any) => r.id === created.data.request.id).requester.name,'Usuario');
    assert.equal((await request(`/join-requests/${created.data.request.id}`,'PATCH',{action:'accepted'},other.cookie)).status,403);
    pass('Listado del administrador y permiso de gestión por grupo');
    const accepted = await request(`/join-requests/${created.data.request.id}`,'PATCH',{action:'accepted'},admin.cookie);
    assert.equal(accepted.status,200); assert.equal(accepted.data.request.group.group_name,'Grupo de integración');
    assert.equal(accepted.data.request.requester.name,'Usuario');
    assert.equal((await request(`/groups/${LOCAL_GROUP}`,'GET',undefined,student.cookie)).data.my_status,'member');
    assert.equal((await request('/groups','GET',undefined,student.cookie)).data.some((g: any) => g.id===LOCAL_GROUP),true);
    assert.equal((await request(`/groups/${LOCAL_GROUP}/join-requests`,'POST',{message:'Duplicada de miembro'},student.cookie)).status,409);
    pass('Aceptar agrega al miembro y sincroniza detalle y Mis grupos');
    const otherRequest = await request(`/groups/${LOCAL_GROUP}/join-requests`,'POST',{message:'Quiero repasar'},other.cookie);
    const race = await Promise.all(['accepted','rejected'].map(action => request(`/join-requests/${otherRequest.data.request.id}`,'PATCH',{action},admin.cookie)));
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
    const [row] = await db.query('SELECT status FROM join_requests WHERE id=$1',[otherRequest.data.request.id]);
    const [membership] = await db.query('SELECT count(*)::int AS total FROM group_members WHERE group_id=$1 AND user_id=$2',[LOCAL_GROUP,LOCAL_USERS.other]);
    assert.equal(membership.total,row.status === 'accepted' ? 1 : 0);
    pass('Aceptar y rechazar simultáneamente conservan una sola decisión');

    await db.query(`UPDATE users SET status='suspended' WHERE id=$1`,[LOCAL_USERS.student]);
    assert.equal((await request('/auth/me','GET',undefined,student.cookie)).status,403);
    assert.equal((await request('/auth/login','POST',{email:'usuario.prueba@aloe.ulima.edu.pe',password:LOCAL_PASSWORD})).status,403);
    await db.query(`UPDATE users SET status='active' WHERE id=$1`,[LOCAL_USERS.student]);
    await db.query('UPDATE users SET is_verified=false WHERE id=$1',[LOCAL_USERS.student]);
    assert.equal((await request('/auth/login','POST',{email:'usuario.prueba@aloe.ulima.edu.pe',password:LOCAL_PASSWORD})).status,403);
    await db.query('UPDATE users SET is_verified=true WHERE id=$1',[LOCAL_USERS.student]);
    pass('Cuenta suspendida o sin verificar no obtiene acceso');
    const logout = await request('/auth/logout','POST',undefined,student.cookie);
    assert.equal(logout.status,200); assert.match(logout.cookie,/Expires=Thu, 01 Jan 1970/i);
    assert.equal((await request('/auth/me','GET',undefined,student.cookie)).status,401);
    const fresh = await login('usuario.prueba@aloe.ulima.edu.pe'); assert.notEqual(fresh.cookie,student.cookie);
    assert.equal((await request('/auth/me','GET',undefined,fresh.cookie)).status,200);
    pass('Logout revoca el token y un nuevo login crea una sesión independiente');
    assert.equal((await request('/auth/me','GET',undefined,'access_token=malformed')).status,401);
    assert.equal((await request('/auth/me','GET',undefined,'access_token=%ZZ')).status,401);
    pass('Cookies inválidas no causan error interno');
    mkdirSync('analysis/validation',{recursive:true});
    writeFileSync('analysis/validation/http-integration.json',JSON.stringify({status:'PASS',checks},null,2));
    console.log(`${checks.length} comprobaciones HTTP completas.`);
  } finally { await app.close(); }
}
run().catch(e => { console.error(e); process.exitCode=1; });
