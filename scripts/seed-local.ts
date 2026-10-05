import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { PasswordHasher } from '../src/auth/password-hasher';

dotenv.config();
export const LOCAL_USERS = {
  student: 'a1300000-0000-4000-8000-000000000001',
  admin: 'a1300000-0000-4000-8000-000000000002',
  other: 'a1300000-0000-4000-8000-000000000003',
};
export const LOCAL_GROUP = 'b1300000-0000-4000-8000-000000000001';
export const LOCAL_COURSE = 'c1300000-0000-4000-8000-000000000001';
export const LOCAL_PASSWORD = 'LuminaLocal2026!';

async function seed() {
  const url = process.env.DATABASE_URL || '';
  const target = new URL(url);
  if (process.env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || target.port !== '55434' || !['/luminaul_equipo', '/luminaul_equipo_test'].includes(target.pathname)) {
    throw new Error('La semilla de prueba solo se ejecuta en una base local luminaul_equipo.');
  }
  const db = await new DataSource({ type: 'postgres', url }).initialize();
  try {
    const hash = await new PasswordHasher().hash(LOCAL_PASSWORD);
    await db.transaction(async (tx) => {
      for (const [id, email, name, role] of [
        [LOCAL_USERS.student, 'usuario.prueba@aloe.ulima.edu.pe', 'Usuario', 'student'],
        [LOCAL_USERS.admin, 'administrador.prueba@aloe.ulima.edu.pe', 'Administrador', 'admin'],
        [LOCAL_USERS.other, 'ana.prueba@aloe.ulima.edu.pe', 'Ana Torres', 'student'],
      ]) {
        await tx.query(`INSERT INTO users(id,email,password_hash,role,status,is_verified)
          VALUES($1,$2,$3,$4,'active',true) ON CONFLICT(id) DO NOTHING`, [id,email,hash,role]);
        await tx.query(`INSERT INTO profiles(user_id,name,bio,major,academic_cycle)
          VALUES($1,$2,'Aprendiendo en comunidad','Ingeniería de Sistemas','5') ON CONFLICT(user_id) DO NOTHING`,[id,name]);
      }
      await tx.query('INSERT INTO courses(id,name,cycle) VALUES($1,$2,5) ON CONFLICT DO NOTHING',[LOCAL_COURSE,'Taller de Ingeniería de Software II']);
      const [course] = await tx.query('SELECT id FROM courses WHERE name=$1',['Taller de Ingeniería de Software II']);
      await tx.query(`INSERT INTO groups(id,name,description,benefits,requirements,meeting_mode,meeting_shift,max_capacity,admin_id)
        VALUES($1,$2,$3,$4,$5,'virtual','tarde',6,$6) ON CONFLICT(id) DO NOTHING`,[
        LOCAL_GROUP, 'Grupo de Ingeniería de Software II', 'Un espacio para repasar patrones de diseño y preparar las prácticas.',
        'Repaso en equipo, ejercicios y preparación para el curso.', 'Interés por TypeScript y disponibilidad para estudiar.', LOCAL_USERS.admin,
      ]);
      await tx.query(`INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'admin') ON CONFLICT DO NOTHING`,[LOCAL_GROUP,LOCAL_USERS.admin]);
      await tx.query(`INSERT INTO publications(id,user_id,group_id,course_id,type,description,status)
        VALUES('d1300000-0000-4000-8000-000000000001',$1,$2,$3,'study_group',$4,'published') ON CONFLICT(id) DO NOTHING`,[
        LOCAL_USERS.admin,LOCAL_GROUP,course.id, '¿Repasamos SOLID y patrones juntos? Buscamos compañeros para preparar las prácticas del curso.',
      ]);
    });
    console.log('Cuentas y grupo locales preparados. Las credenciales están en docs/INTEGRACION_ROBERT.md.');
  } finally { await db.destroy(); }
}
if (require.main === module) seed().catch((e) => { console.error(e.message); process.exitCode=1; });
