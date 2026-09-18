import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { DEMO_USER_ID } from '../src/common/decorators/current-user.decorator';
import { JoinRequestsController } from '../src/join-requests/join-requests.controller';
import { RespondJoinRequestDto } from '../src/join-requests/dto/respond-join-request.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';

const OTHER_USER_ID = '11111111-2222-3333-4444-555555555555';
const STUDENT_3_ID = '22222222-3333-4444-5555-666666666666';
const NON_EXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

interface TestResult {
  hu: string;
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function recordTest(hu: string, name: string, passed: boolean, error?: string) {
  results.push({ hu, name, passed, error });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [${hu}] ${name}`);
  if (error) {
    console.error(`       Error: ${error}`);
  }
}

async function runSprint2Tests() {
  console.log('\n======================================================');
  console.log('🚀 INICIANDO SUITE DE PRUEBAS DE HISTORIA DE USUARIO (HU 2.2)');
  console.log('   Gestionar solicitud de unión al grupo de estudio');
  console.log('======================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const dataSource = app.get(DataSource);
  const controller = app.get(JoinRequestsController);

  let group1Id = 'aaaaaaaa-1111-2222-3333-444444444444';
  let group2Id = 'bbbbbbbb-1111-2222-3333-444444444444';
  let request1Id = '';
  let request2Id = '';
  let request3Id = '';

  try {
    console.log('📦 Verificando estructura de BD y sembrando datos para HU 2.2...');

    // 0. Crear tablas si no existen
    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL DEFAULT 'member',
        joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_group_members_group_user ON group_members (group_id, user_id);

      CREATE TABLE IF NOT EXISTS join_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP
      );

      ALTER TABLE join_requests ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS message TEXT;
      ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP;

      CREATE INDEX IF NOT EXISTS idx_join_requests_group_status ON join_requests (group_id, status);
      CREATE INDEX IF NOT EXISTS idx_join_requests_requester ON join_requests (requester_id, status);
    `);

    // Limpiar datos previos de pruebas
    await dataSource.query(`DELETE FROM join_requests;`);
    await dataSource.query(`DELETE FROM group_members;`);
    await dataSource.query(`DELETE FROM publications WHERE user_id IN ('${DEMO_USER_ID}', '${OTHER_USER_ID}', '${STUDENT_3_ID}');`);
    await dataSource.query(`DELETE FROM groups WHERE admin_id IN ('${DEMO_USER_ID}', '${OTHER_USER_ID}', '${STUDENT_3_ID}');`);
    await dataSource.query(`DELETE FROM profiles WHERE user_id IN ('${DEMO_USER_ID}', '${OTHER_USER_ID}', '${STUDENT_3_ID}');`);
    await dataSource.query(`DELETE FROM users WHERE id IN ('${DEMO_USER_ID}', '${OTHER_USER_ID}', '${STUDENT_3_ID}');`);

    // Insertar usuarios de prueba
    await dataSource.query(`
      INSERT INTO users (id, email, password_hash, role, status, is_verified, created_at, updated_at)
      VALUES 
        ('${DEMO_USER_ID}', 'demo.admin@ulima.edu.pe', 'hash123', 'student', 'active', true, NOW(), NOW()),
        ('${OTHER_USER_ID}', 'juan.perez@ulima.edu.pe', 'hash456', 'student', 'active', true, NOW(), NOW()),
        ('${STUDENT_3_ID}', 'carlos.mendoza@ulima.edu.pe', 'hash789', 'student', 'active', true, NOW(), NOW());
    `);

    // Insertar perfiles
    await dataSource.query(`
      INSERT INTO profiles (user_id, name, bio, major, academic_cycle, profile_photo_url, updated_at)
      VALUES 
        ('${DEMO_USER_ID}', 'Martín Vizcarra (Admin)', 'Admin de grupos', 'Ingeniería de Sistemas', '6', 'https://avatar.test/martin.png', NOW()),
        ('${OTHER_USER_ID}', 'Juan Pérez', 'Estudiante de Industrial', 'Ingeniería Industrial', '3', 'https://avatar.test/juan.png', NOW()),
        ('${STUDENT_3_ID}', 'Carlos Mendoza', 'Estudiante de Sistemas', 'Ingeniería de Sistemas', '4', NULL, NOW());
    `);

    // Insertar 2 grupos administrados por DEMO_USER_ID
    await dataSource.query(`
      INSERT INTO groups (id, name, description, benefits, requirements, meeting_mode, meeting_shift, max_capacity, admin_id, created_at)
      VALUES 
        ('${group1Id}', 'Grupo de Estudio Cálculo I', 'Grupo para repasar exámenes pasados', 'Material exclusivo', 'Haber llevado intro', 'virtual', 'mañana', 10, '${DEMO_USER_ID}', NOW()),
        ('${group2Id}', 'Grupo de Estudio Algoritmos', 'Algoritmos y estructuras avanzadas', 'Asesorías', 'Ganas de aprender', 'presencial', 'tarde', 8, '${DEMO_USER_ID}', NOW());
    `);

    console.log('   Datos de prueba sembrados correctamente.\n');

    // =========================================================================
    // PRUEBA 1: CA #3 - Ver lista de solicitudes vacía
    // =========================================================================
    try {
      const response = await controller.listMyRequests(DEMO_USER_ID);
      const isOk =
        response.total === 0 &&
        Array.isArray(response.requests) &&
        response.requests.length === 0 &&
        response.message === 'No hay solicitudes pendientes por revisar';

      if (!isOk) {
        throw new Error(
          `Respuesta inesperada: total=${response.total}, message="${response.message}", requests length=${response.requests.length}`,
        );
      }
      recordTest('HU 2.2 - CA #3', 'Listar solicitudes cuando no hay pendientes devuelve mensaje de vacío', true);
    } catch (err: any) {
      recordTest('HU 2.2 - CA #3', 'Listar solicitudes cuando no hay pendientes', false, err.message);
    }

    // =========================================================================
    // PRUEBA 2: CA #4 - Ver lista de solicitudes con solicitud pendiente
    // =========================================================================
    try {
      const insertReq1 = await dataSource.query(`
        INSERT INTO join_requests (id, group_id, requester_id, status, message, created_at)
        VALUES (gen_random_uuid(), '${group1Id}', '${OTHER_USER_ID}', 'pending', 'Quiero unirme para repasar integrales', NOW())
        RETURNING id;
      `);
      request1Id = insertReq1[0].id;

      const response = await controller.listMyRequests(DEMO_USER_ID);
      const req = response.requests.find((r) => r.id === request1Id);

      const isOk =
        response.total === 1 &&
        response.message === null &&
        req !== undefined &&
        req.group.group_id === group1Id &&
        req.group.group_name === 'Grupo de Estudio Cálculo I' &&
        req.requester.user_id === OTHER_USER_ID &&
        req.requester.name === 'Juan Pérez' &&
        req.requester.profile_photo_url === 'https://avatar.test/juan.png' &&
        req.status === 'pending' &&
        req.message === 'Quiero unirme para repasar integrales';

      if (!isOk) {
        throw new Error(`Datos de la solicitud devuelta no coinciden con lo esperado: ${JSON.stringify(response)}`);
      }
      recordTest('HU 2.2 - CA #4', 'Listar solicitudes con 1 pendiente retorna datos de grupo y solicitante con mensaje null', true);
    } catch (err: any) {
      recordTest('HU 2.2 - CA #4', 'Listar solicitudes con 1 pendiente', false, err.message);
    }

    // =========================================================================
    // PRUEBA 3: CA #4 - Solicitudes de múltiples grupos del mismo admin
    // =========================================================================
    try {
      const insertReq2 = await dataSource.query(`
        INSERT INTO join_requests (id, group_id, requester_id, status, message, created_at)
        VALUES (gen_random_uuid(), '${group2Id}', '${STUDENT_3_ID}', 'pending', 'Deseo practicar árboles binarios', NOW())
        RETURNING id;
      `);
      request2Id = insertReq2[0].id;

      const response = await controller.listMyRequests(DEMO_USER_ID);

      const hasGroup1 = response.requests.some((r) => r.group.group_id === group1Id);
      const hasGroup2 = response.requests.some((r) => r.group.group_id === group2Id);

      const isOk = response.total === 2 && hasGroup1 && hasGroup2 && response.message === null;

      if (!isOk) {
        throw new Error(`Lista multi-grupo incorrecta: total=${response.total}, hasG1=${hasGroup1}, hasG2=${hasGroup2}`);
      }
      recordTest('HU 2.2 - CA #4', 'Listar solicitudes muestra solicitudes pendientes de TODOS los grupos del admin', true);
    } catch (err: any) {
      recordTest('HU 2.2 - CA #4', 'Listar solicitudes multi-grupo', false, err.message);
    }

    // =========================================================================
    // PRUEBA 4: CA #1 - Aceptar solicitud pendiente
    // =========================================================================
    try {
      const response = await controller.respondToRequest(
        request1Id,
        { action: 'accepted' },
        DEMO_USER_ID,
      );

      // Verificar respuesta del controlador
      const responseOk =
        response.request.id === request1Id &&
        response.request.status === 'accepted' &&
        response.request.responded_at !== null &&
        response.message === 'Solicitud aceptada exitosamente';

      // Verificar inserción atómica en group_members
      const members = await dataSource.query(`
        SELECT * FROM group_members WHERE group_id = '${group1Id}' AND user_id = '${OTHER_USER_ID}';
      `);

      const dbOk = members.length === 1 && members[0].role === 'member';

      if (!responseOk || !dbOk) {
        throw new Error(`Aceptación fallida: responseOk=${responseOk}, dbOk=${dbOk}, membersCount=${members.length}`);
      }
      recordTest('HU 2.2 - CA #1', 'Aceptar solicitud actualiza status a "accepted" e inserta miembro en group_members de forma atómica', true);
    } catch (err: any) {
      recordTest('HU 2.2 - CA #1', 'Aceptar solicitud pendiente', false, err.message);
    }

    // =========================================================================
    // PRUEBA 5: CA #2 - Rechazar solicitud pendiente
    // =========================================================================
    try {
      const response = await controller.respondToRequest(
        request2Id,
        { action: 'rejected' },
        DEMO_USER_ID,
      );

      const responseOk =
        response.request.id === request2Id &&
        response.request.status === 'rejected' &&
        response.request.responded_at !== null &&
        response.message === 'Solicitud rechazada exitosamente';

      // Verificar que NO se insertó en group_members
      const members = await dataSource.query(`
        SELECT * FROM group_members WHERE group_id = '${group2Id}' AND user_id = '${STUDENT_3_ID}';
      `);
      const noMember = members.length === 0;

      // Verificar que ya no aparece en el listado de pendientes
      const listAfter = await controller.listMyRequests(DEMO_USER_ID);
      const notInPendingList = !listAfter.requests.some((r) => r.id === request2Id);
      const isNowEmpty = listAfter.total === 0 && listAfter.message === 'No hay solicitudes pendientes por revisar';

      if (!responseOk || !noMember || !notInPendingList || !isNowEmpty) {
        throw new Error(
          `Rechazo fallido: responseOk=${responseOk}, noMember=${noMember}, notInList=${notInPendingList}, isNowEmpty=${isNowEmpty}`,
        );
      }
      recordTest('HU 2.2 - CA #2', 'Rechazar solicitud actualiza status a "rejected" y la elimina de la lista de pendientes', true);
    } catch (err: any) {
      recordTest('HU 2.2 - CA #2', 'Rechazar solicitud pendiente', false, err.message);
    }

    // =========================================================================
    // PRUEBA 6: Seguridad - Usuario no admin intenta responder solicitud
    // =========================================================================
    try {
      // Crear solicitud pendiente para probar permisos
      const insertReq3 = await dataSource.query(`
        INSERT INTO join_requests (id, group_id, requester_id, status, message, created_at)
        VALUES (gen_random_uuid(), '${group1Id}', '${STUDENT_3_ID}', 'pending', 'Solicitud para prueba de seguridad', NOW())
        RETURNING id;
      `);
      request3Id = insertReq3[0].id;

      let caughtForbidden = false;
      try {
        await controller.respondToRequest(
          request3Id,
          { action: 'accepted' },
          OTHER_USER_ID, // OTHER_USER_ID no es admin de group1Id
        );
      } catch (err: any) {
        if (err instanceof ForbiddenException) {
          caughtForbidden = true;
        } else {
          throw err;
        }
      }

      if (!caughtForbidden) {
        throw new Error('Se esperaba ForbiddenException (403) al responder solicitud siendo no admin');
      }
      recordTest('HU 2.2 - Seguridad', 'Usuario no administrador recibe ForbiddenException (403)', true);
    } catch (err: any) {
      recordTest('HU 2.2 - Seguridad', 'Protección de administrador en respondToRequest', false, err.message);
    }

    // =========================================================================
    // PRUEBA 7: Idempotencia - Intentar responder solicitud ya procesada
    // =========================================================================
    try {
      let caughtConflict = false;
      try {
        // request1Id ya fue aceptada en la Prueba 4
        await controller.respondToRequest(
          request1Id,
          { action: 'accepted' },
          DEMO_USER_ID,
        );
      } catch (err: any) {
        if (err instanceof ConflictException) {
          caughtConflict = true;
        } else {
          throw err;
        }
      }

      if (!caughtConflict) {
        throw new Error('Se esperaba ConflictException (409) al re-procesar solicitud');
      }
      recordTest('HU 2.2 - Idempotencia', 'Responder solicitud ya procesada lanza ConflictException (409)', true);
    } catch (err: any) {
      recordTest('HU 2.2 - Idempotencia', 'Validación de estado pendiente', false, err.message);
    }

    // =========================================================================
    // PRUEBA 8: Edge case - Solicitud inexistente
    // =========================================================================
    try {
      let caughtNotFound = false;
      try {
        await controller.respondToRequest(
          NON_EXISTENT_UUID,
          { action: 'accepted' },
          DEMO_USER_ID,
        );
      } catch (err: any) {
        if (err instanceof NotFoundException) {
          caughtNotFound = true;
        } else {
          throw err;
        }
      }

      if (!caughtNotFound) {
        throw new Error('Se esperaba NotFoundException (404) para UUID inexistente');
      }
      recordTest('HU 2.2 - Edge case', 'Responder a solicitud con UUID inexistente lanza NotFoundException (404)', true);
    } catch (err: any) {
      recordTest('HU 2.2 - Edge case', 'Solicitud no encontrada', false, err.message);
    }

    // =========================================================================
    // PRUEBA 9: Validación de DTO - Acción inválida
    // =========================================================================
    try {
      const invalidDto = plainToInstance(RespondJoinRequestDto, { action: 'maybe' });
      const errors = await validate(invalidDto);
      const hasActionError = errors.some((e) => e.property === 'action');

      if (!hasActionError) {
        throw new Error('Se esperaba error de validación en RespondJoinRequestDto para action="maybe"');
      }
      recordTest('HU 2.2 - DTO Validation', 'RespondJoinRequestDto rechaza valores distintos a "accepted" o "rejected"', true);
    } catch (err: any) {
      recordTest('HU 2.2 - DTO Validation', 'Validación estricta de acción en DTO', false, err.message);
    }

  } catch (globalErr: any) {
    console.error('💥 Error crítico en suite de pruebas:', globalErr.message);
  } finally {
    await app.close();
  }

  // =========================================================================
  // RESUMEN FINAL
  // =========================================================================
  console.log('\n======================================================');
  console.log('📊 RESUMEN DE EJECUCIÓN (HISTORIA DE USUARIO 2.2)');
  console.log('======================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total pruebas : ${total}`);
  console.log(`Exitosas     : ${passed}`);
  console.log(`Fallidas     : ${failed}`);

  if (failed > 0) {
    console.log('\n❌ ALGUNAS PRUEBAS FALLARON.');
    process.exit(1);
  } else {
    console.log('\n✨ TODAS LAS PRUEBAS DE LA HU 2.2 PASARON CON ÉXITO.');
  }
}

runSprint2Tests();
