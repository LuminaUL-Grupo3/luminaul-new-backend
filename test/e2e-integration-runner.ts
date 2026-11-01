import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
  UnauthorizedException,
} from '@nestjs/common';

// Controladores a probar
import { PostsController } from '../src/posts/posts.controller';
import { CoursesController } from '../src/courses/courses.controller';
import { GroupsController } from '../src/groups/groups.controller';
import { GroupJoinRequestsController } from '../src/join-requests/group-join-requests.controller';
import { JoinRequestsController } from '../src/join-requests/join-requests.controller';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';

// DTOs
import { PostCreateDto } from '../src/posts/dto/post-create.dto';
import { PostUpdateDto } from '../src/posts/dto/post-update.dto';
import { RespondJoinRequestDto } from '../src/join-requests/dto/respond-join-request.dto';
import { CreateJoinRequestDto } from '../src/join-requests/dto/create-join-request.dto';
import { JwtPayload } from '../src/auth/token.util';

// IDs fijos para pruebas reproducibles
const USER_ALUMNO_1 = '00000000-0000-0000-0000-000000000001';
const USER_ALUMNO_2 = '00000000-0000-0000-0000-000000000002';
const USER_ALUMNO_3 = '00000000-0000-0000-0000-000000000003';
const NON_EXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

interface TestResult {
  epic: string;
  hu: string;
  criterion: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function recordTest(
  epic: string,
  hu: string,
  criterion: string,
  passed: boolean,
  error?: string,
) {
  results.push({ epic, hu, criterion, passed, error });
  const icon = passed ? '[PASS]' : '[FAIL]';
  console.log(`${icon} [${hu}] ${criterion}`);
  if (error) {
    console.error(`       Error: ${error}`);
  }
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-luminaul-development-2026';

function generateJwt(payload: JwtPayload, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

async function runMasterE2ETests() {
  console.log('======================================================================');
  console.log('SUITE DE PRUEBAS DE INTEGRACION END-TO-END - LUMINAUL');
  console.log('   Verificación Integral de Historias de Usuario y Criterios de Aceptación');
  console.log('   Documento: RELEASE_1_2_EPICAS-HU-TAREAS.md & SPECS.md v3.0.0');
  console.log('======================================================================\n');

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-luminaul-development-2026';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dataSource = app.get(DataSource);
  const configService = app.get(ConfigService);
  const jwtSecret = configService.get<string>('JWT_SECRET') || 'super-secret-key-luminaul-development-2026';

  // Controladores y Servicios
  const postsController = app.get(PostsController);
  const coursesController = app.get(CoursesController);
  const groupsController = app.get(GroupsController);
  const groupJoinRequestsController = app.get(GroupJoinRequestsController);
  const joinRequestsController = app.get(JoinRequestsController);
  const authController = app.get(AuthController);
  const authService = app.get(AuthService);

  let courseSistemasId = '';
  let courseCalculoId = '';
  let createdPostId = '';
  let createdPostTutoringId = '';
  let groupAutoId = '';
  let existingGroupId = '99999999-1111-2222-3333-444444444444';
  let createdRequestId = '';

  try {
    console.log('[1/3] Preparando entorno de pruebas y sembrando datos en PostgreSQL...');

    // Limpieza de datos temporales previos
    await dataSource.query(`DELETE FROM join_requests WHERE requester_id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}') OR group_id = '${existingGroupId}';`);
    await dataSource.query(`DELETE FROM group_members WHERE user_id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}') OR group_id = '${existingGroupId}';`);
    await dataSource.query(`DELETE FROM publications WHERE user_id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}');`);
    await dataSource.query(`DELETE FROM groups WHERE admin_id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}') OR id = '${existingGroupId}';`);
    await dataSource.query(`DELETE FROM profiles WHERE user_id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}');`);
    await dataSource.query(`DELETE FROM revoked_tokens WHERE user_id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}');`);
    await dataSource.query(`DELETE FROM users WHERE id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}');`);
    await dataSource.query(`DELETE FROM courses WHERE name IN ('Ingeniería de Software E2E', 'Cálculo Avanzado E2E');`);

    // Sembrar usuarios de prueba
    await dataSource.query(`
      INSERT INTO users (id, email, password_hash, name, role, status, is_verified, created_at, updated_at)
      VALUES 
        ('${USER_ALUMNO_1}', 'alumno1@aloe.ulima.edu.pe', '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2', 'Martín Vizcarra (Alumno 1)', 'student', 'active', true, NOW(), NOW()),
        ('${USER_ALUMNO_2}', 'alumno2@aloe.ulima.edu.pe', '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2', 'Carlos Mendoza (Alumno 2)', 'student', 'active', true, NOW(), NOW()),
        ('${USER_ALUMNO_3}', 'alumno3@aloe.ulima.edu.pe', '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2', 'Juan Pérez (Alumno 3)', 'student', 'active', true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `);

    // Sembrar perfiles
    await dataSource.query(`
      INSERT INTO profiles (user_id, name, bio, major, academic_cycle, profile_photo_url, updated_at)
      VALUES 
        ('${USER_ALUMNO_1}', 'Martín Vizcarra (Alumno 1)', 'Estudiante de 5to ciclo de Sistemas', 'Ingeniería de Sistemas', '5', 'https://avatar.test/martin.png', NOW()),
        ('${USER_ALUMNO_2}', 'Carlos Mendoza (Alumno 2)', 'Estudiante de 4to ciclo de Sistemas', 'Ingeniería de Sistemas', '4', 'https://avatar.test/carlos.png', NOW()),
        ('${USER_ALUMNO_3}', 'Juan Pérez (Alumno 3)', 'Estudiante de 3er ciclo de Industrial', 'Ingeniería Industrial', '3', NULL, NOW())
      ON CONFLICT (user_id) DO NOTHING;
    `);

    // Sembrar cursos de prueba
    const insertedCourses = await dataSource.query(`
      INSERT INTO courses (id, name, cycle)
      VALUES 
        (gen_random_uuid(), 'Ingeniería de Software E2E', 5),
        (gen_random_uuid(), 'Cálculo Avanzado E2E', 2)
      RETURNING id, name;
    `);
    courseSistemasId = insertedCourses[0].id;
    courseCalculoId = insertedCourses[1].id;

    // Sembrar un grupo pre-existente administrado por ALUMNO_1
    await dataSource.query(`
      INSERT INTO groups (id, name, description, benefits, requirements, course_code, leader_id, admin_id, meeting_mode, meeting_shift, max_capacity, created_at)
      VALUES ('${existingGroupId}', 'Grupo Existente de Sistemas', 'Grupo creado previamente', 'Exámenes pasados', 'Ganas de estudiar', 'CS302', '${USER_ALUMNO_1}', '${USER_ALUMNO_1}', 'virtual', 'tarde', 3, NOW());
      
      INSERT INTO group_members (group_id, user_id, role, status, joined_at)
      VALUES ('${existingGroupId}', '${USER_ALUMNO_1}', 'leader', 'active', NOW());
    `);

    console.log('   [OK] Datos de prueba sembrados correctamente.\n');

    // =========================================================================
    // SECCIÓN 1: ÉPICA 1 — GESTIONAR PUBLICACIONES
    // =========================================================================
    console.log('----------------------------------------------------------------------');
    console.log('EPICA 1: GESTIONAR PUBLICACIONES (Sprint 1)');
    console.log('----------------------------------------------------------------------');

    // H.U 1.1: Agregar publicación — Validaciones de entrada
    try {
      const invalidTypeDto = plainToInstance(PostCreateDto, {
        course_id: courseSistemasId,
        type: 'tipo_invalido',
        description: 'Descripción válida',
      });
      const errorsType = await validate(invalidTypeDto);
      const hasTypeError = errorsType.some((e) => e.property === 'type');
      recordTest('Épica 1', 'H.U 1.1', 'Rechaza tipos no permitidos (solo study_group o tutoring)', hasTypeError);

      const blankDescDto = plainToInstance(PostCreateDto, {
        course_id: courseSistemasId,
        type: 'study_group',
        description: '      ',
      });
      const errorsBlank = await validate(blankDescDto);
      const hasBlankError = errorsBlank.some((e) => e.property === 'description');
      recordTest('Épica 1', 'H.U 1.1', 'Rechaza descripciones vacías o con solo espacios en blanco', hasBlankError);

      try {
        await postsController.createPost(
          {
            course_id: NON_EXISTENT_UUID,
            type: 'study_group',
            description: 'Intento de post con curso fantasma',
          } as PostCreateDto,
          USER_ALUMNO_1,
        );
        recordTest('Épica 1', 'H.U 1.1', 'Rechaza curso inexistente con 422 UnprocessableEntity', false, 'No lanzó 422');
      } catch (err: any) {
        const is422 = err instanceof UnprocessableEntityException;
        recordTest('Épica 1', 'H.U 1.1', 'Rechaza curso inexistente con 422 UnprocessableEntity', is422);
      }
    } catch (err: any) {
      recordTest('Épica 1', 'H.U 1.1', 'Validaciones de DTO de creación', false, err.message);
    }

    // H.U 1.1: Agregar publicación — Caso exitoso con auto-creación de grupo
    try {
      const createdPost = await postsController.createPost(
        {
          course_id: courseSistemasId,
          type: 'study_group',
          description: 'Buscamos 2 personas para repasar patrones de diseño y clean code.',
          benefits: 'Asesoría y banco de preguntas',
          requirements: 'Disponibilidad los viernes por la noche',
          max_capacity: 5,
        } as PostCreateDto,
        USER_ALUMNO_1,
      );

      createdPostId = createdPost.id;
      groupAutoId = createdPost.groupId || createdPost.group_id || '';

      const passed =
        createdPost.id &&
        (createdPost.userId === USER_ALUMNO_1 || createdPost.user_id === USER_ALUMNO_1) &&
        (createdPost.courseId === courseSistemasId || createdPost.course_id === courseSistemasId) &&
        createdPost.status === 'published' &&
        Boolean(groupAutoId);

      recordTest('Épica 1', 'H.U 1.1', 'Crea publicación de estudio con auto-creación de grupo y status published', Boolean(passed));

      // Verificar que el grupo auto-creado tiene a ALUMNO_1 como admin/líder
      const groupInDb = await dataSource.query(`SELECT * FROM groups WHERE id = '${groupAutoId}';`);
      const groupAutoValid =
        groupInDb.length > 0 &&
        groupInDb[0].name === 'Grupo de Ingeniería de Software E2E' &&
        (groupInDb[0].admin_id === USER_ALUMNO_1 || groupInDb[0].leader_id === USER_ALUMNO_1);
      recordTest('Épica 1', 'H.U 1.1', 'Grupo auto-creado vinculado correctamente con líder/admin asignado', groupAutoValid);
    } catch (err: any) {
      recordTest('Épica 1', 'H.U 1.1', 'Crear publicación con auto-grupo', false, err.message);
    }

    // H.U 1.1: Agregar publicación — Caso tutoría pura sin grupo
    try {
      const tutoringPost = await postsController.createPost(
        {
          course_id: courseCalculoId,
          type: 'tutoring',
          description: 'Ofrezco tutoría 1 a 1 de Cálculo Avanzado para la PC1.',
        } as PostCreateDto,
        USER_ALUMNO_2,
      );
      createdPostTutoringId = tutoringPost.id;
      const passedTutoring =
        tutoringPost.id &&
        (tutoringPost.groupId === null || tutoringPost.group_id === null) &&
        tutoringPost.type === 'tutoring';
      recordTest('Épica 1', 'H.U 1.1', 'Crea publicación sin grupo cuando es tutoría pura (groupId es null)', Boolean(passedTutoring));
    } catch (err: any) {
      recordTest('Épica 1', 'H.U 1.1', 'Crear tutoría sin grupo', false, err.message);
    }

    // H.U 1.5: Ver feed de publicaciones
    try {
      const feed = await postsController.listPosts({});
      const foundPost = feed.find((p) => p.id === createdPostId);
      const passedFeed =
        foundPost !== undefined &&
        (foundPost.author?.name === 'Martín Vizcarra (Alumno 1)' || foundPost.author?.name?.includes('Martín')) &&
        foundPost.course?.name === 'Ingeniería de Software E2E';
      recordTest('Épica 1', 'H.U 1.5', 'Feed muestra publicaciones activas con autor (perfil) y curso anidado', Boolean(passedFeed));
    } catch (err: any) {
      recordTest('Épica 1', 'H.U 1.5', 'Visualizar feed público', false, err.message);
    }

    // H.U 1.3: Filtrar publicaciones
    try {
      const filterByCourse = await postsController.listPosts({ course_id: courseSistemasId } as any);
      const passedCourse = filterByCourse.length > 0 && filterByCourse.every((p) => (p.course?.id === courseSistemasId || (p as any).courseId === courseSistemasId));
      recordTest('Épica 1', 'H.U 1.3', 'Filtrar publicaciones por curso específico', passedCourse);

      const filterByType = await postsController.listPosts({ type: 'tutoring' } as any);
      const passedType = filterByType.length > 0 && filterByType.every((p) => p.type === 'tutoring');
      recordTest('Épica 1', 'H.U 1.3', 'Filtrar publicaciones por tipo (Asesoría / tutoring)', passedType);

      const filterByCycle = await postsController.listPosts({ cycle: 5 } as any);
      const passedCycle = filterByCycle.length > 0 && filterByCycle.every((p) => p.course?.cycle === 5);
      recordTest('Épica 1', 'H.U 1.3', 'Filtrar publicaciones por ciclo del curso (Ciclo 5)', passedCycle);

      const filterBySearch = await postsController.listPosts({ search: 'clean code' } as any);
      const passedSearch = filterBySearch.some((p) => p.id === createdPostId);
      recordTest('Épica 1', 'H.U 1.3', 'Búsqueda parcial de texto (search: "clean code") insensible a mayúsculas', passedSearch);

      const filterNoMatches = await postsController.listPosts({ cycle: 10 } as any);
      recordTest('Épica 1', 'H.U 1.3', 'Filtro sin coincidencias retorna lista vacía', filterNoMatches.length === 0);
    } catch (err: any) {
      recordTest('Épica 1', 'H.U 1.3', 'Filtros de publicaciones', false, err.message);
    }

    // H.U 1.6: Ver historial de mis publicaciones
    try {
      const myPosts = await postsController.getMyPosts({}, USER_ALUMNO_1);
      const passedMy = myPosts.some((p) => p.id === createdPostId);
      recordTest('Épica 1', 'H.U 1.6', 'Historial propio retorna publicaciones del usuario autenticado', passedMy);

      const otherPosts = await postsController.getMyPosts({}, USER_ALUMNO_3);
      recordTest('Épica 1', 'H.U 1.6', 'Historial propio no expone publicaciones de otros usuarios (lista vacía)', otherPosts.length === 0);
    } catch (err: any) {
      recordTest('Épica 1', 'H.U 1.6', 'Historial de publicaciones', false, err.message);
    }

    // H.U 1.2: Editar publicación
    try {
      // Tercero intenta editar -> 403 Forbidden
      try {
        await postsController.editPost(createdPostId, { description: 'Intento malicioso' } as PostUpdateDto, USER_ALUMNO_2);
        recordTest('Épica 1', 'H.U 1.2', 'Rechaza edición ajena con 403 Forbidden', false, 'No lanzó 403');
      } catch (err: any) {
        const is403 = err instanceof ForbiddenException;
        recordTest('Épica 1', 'H.U 1.2', 'Rechaza edición ajena con 403 Forbidden', is403);
      }

      // Edición legítima por el autor
      const edited = await postsController.editPost(
        createdPostId,
        { description: 'Descripción actualizada con éxito para el proyecto final.' } as PostUpdateDto,
        USER_ALUMNO_1,
      );
      recordTest('Épica 1', 'H.U 1.2', 'Edita exitosamente la publicación cuando es el autor', edited.description === 'Descripción actualizada con éxito para el proyecto final.');

      // Intento en post inexistente -> 404 Not Found
      try {
        await postsController.editPost(NON_EXISTENT_UUID, { description: '...' } as PostUpdateDto, USER_ALUMNO_1);
        recordTest('Épica 1', 'H.U 1.2', 'Rechaza edición de post inexistente con 404 Not Found', false, 'No lanzó 404');
      } catch (err: any) {
        const is404 = err instanceof NotFoundException;
        recordTest('Épica 1', 'H.U 1.2', 'Rechaza edición de post inexistente con 404 Not Found', is404);
      }
    } catch (err: any) {
      recordTest('Épica 1', 'H.U 1.2', 'Editar publicación', false, err.message);
    }

    // H.U 1.4: Eliminar publicación (Soft delete)
    try {
      // Tercero intenta eliminar -> 403 Forbidden
      try {
        await postsController.deletePost(createdPostTutoringId, USER_ALUMNO_1);
        recordTest('Épica 1', 'H.U 1.4', 'Rechaza eliminación ajena con 403 Forbidden', false, 'No lanzó 403');
      } catch (err: any) {
        const is403 = err instanceof ForbiddenException;
        recordTest('Épica 1', 'H.U 1.4', 'Rechaza eliminación ajena con 403 Forbidden', is403);
      }

      // Eliminación legítima por el autor
      const delResult = await postsController.deletePost(createdPostTutoringId, USER_ALUMNO_2);
      recordTest('Épica 1', 'H.U 1.4', 'Realiza soft delete retornando confirmación exitosa', delResult.success === true);

      // Verificar en PostgreSQL que status='hidden' y deleted_at no es nulo
      const dbPost = await dataSource.query(`SELECT deleted_at, status FROM publications WHERE id = '${createdPostTutoringId}';`);
      const softDeletedInDb = dbPost.length > 0 && dbPost[0].deleted_at !== null && dbPost[0].status === 'hidden';
      recordTest('Épica 1', 'H.U 1.4', 'Soft delete verificado en PostgreSQL (deleted_at NOT NULL, status = hidden)', softDeletedInDb);

      // Desaparece del feed
      const feedAfter = await postsController.listPosts({});
      const notInFeed = !feedAfter.some((p) => p.id === createdPostTutoringId);
      recordTest('Épica 1', 'H.U 1.4', 'Publicación eliminada desaparece automáticamente del Feed público', notInFeed);
    } catch (err: any) {
      recordTest('Épica 1', 'H.U 1.4', 'Eliminar publicación', false, err.message);
    }

    // =========================================================================
    // SECCIÓN 2: ÉPICA 2 — GESTIONAR COMUNICACIÓN (GRUPOS Y SOLICITUDES)
    // =========================================================================
    console.log('\n----------------------------------------------------------------------');
    console.log('EPICA 2: GESTIONAR COMUNICACION (Sprint 2 & 3)');
    console.log('----------------------------------------------------------------------');

    // H.U 2.1: Enviar solicitud de unión al grupo de estudio
    try {
      // Estado antes de enviar solicitud: my_status === 'none'
      const detailBefore = await groupsController.getGroupDetail(existingGroupId, USER_ALUMNO_2);
      recordTest('Épica 2', 'H.U 2.1', 'Detalle de grupo retorna my_status = "none" para no miembro sin solicitud', detailBefore.my_status === 'none');

      // 1. Enviar solicitud por primera vez (201 Created)
      const reqResult = await groupJoinRequestsController.createRequest(
        existingGroupId,
        { message: 'Hola, me gustaría unirme a su grupo de estudio' } as CreateJoinRequestDto,
        USER_ALUMNO_2,
      );
      createdRequestId = reqResult.request.id;
      recordTest('Épica 2', 'H.U 2.1', 'Enviar solicitud por primera vez a un grupo retorna 201 y mensaje de éxito', reqResult.message === 'Solicitud enviada con éxito' && reqResult.request.status === 'pending');

      // Estado después de enviar solicitud: my_status === 'pending'
      const detailPending = await groupsController.getGroupDetail(existingGroupId, USER_ALUMNO_2);
      recordTest('Épica 2', 'H.U 2.1', 'Detalle de grupo actualiza my_status = "pending" tras enviar solicitud', detailPending.my_status === 'pending');

      // 2. Enviar solicitud duplicada al mismo grupo -> 409 Conflict
      try {
        await groupJoinRequestsController.createRequest(
          existingGroupId,
          { message: 'Intento duplicado' } as CreateJoinRequestDto,
          USER_ALUMNO_2,
        );
        recordTest('Épica 2', 'H.U 2.1', 'Rechaza solicitud duplicada con 409 Conflict', false, 'No lanzó 409');
      } catch (err: any) {
        const is409 = err instanceof ConflictException;
        recordTest('Épica 2', 'H.U 2.1', 'Rechaza solicitud duplicada con 409 Conflict ("Ya tienes una solicitud pendiente")', is409);
      }

      // 3. Enviar solicitud a un grupo donde ya es miembro/líder -> 409 Conflict
      try {
        await groupJoinRequestsController.createRequest(
          existingGroupId,
          { message: 'Soy el líder' } as CreateJoinRequestDto,
          USER_ALUMNO_1,
        );
        recordTest('Épica 2', 'H.U 2.1', 'Rechaza solicitud de un usuario que ya es miembro con 409 Conflict', false, 'No lanzó 409');
      } catch (err: any) {
        const is409 = err instanceof ConflictException;
        recordTest('Épica 2', 'H.U 2.1', 'Rechaza solicitud de un usuario que ya es miembro con 409 Conflict', is409);
      }

      // 4. Enviar solicitud a grupo inexistente -> 404 Not Found
      try {
        await groupJoinRequestsController.createRequest(
          NON_EXISTENT_UUID,
          { message: 'Grupo inexistente' } as CreateJoinRequestDto,
          USER_ALUMNO_2,
        );
        recordTest('Épica 2', 'H.U 2.1', 'Rechaza solicitud hacia grupo inexistente con 404 Not Found', false, 'No lanzó 404');
      } catch (err: any) {
        const is404 = err instanceof NotFoundException;
        recordTest('Épica 2', 'H.U 2.1', 'Rechaza solicitud hacia grupo inexistente con 404 Not Found', is404);
      }
    } catch (err: any) {
      recordTest('Épica 2', 'H.U 2.1', 'Enviar solicitudes de unión', false, err.message);
    }

    // H.U 2.2: Gestionar solicitudes de unión
    try {
      // 1. Listar solicitudes recibidas por el administrador (ALUMNO_1)
      const myRequests = await joinRequestsController.listMyRequests(USER_ALUMNO_1);
      const hasPendingReq = myRequests.requests.some((r) => r.id === createdRequestId && r.requester.name?.includes('Carlos'));
      recordTest('Épica 2', 'H.U 2.2', 'Listar solicitudes pendientes muestra las solicitudes de los grupos del admin', hasPendingReq);

      // 2. Usuario sin solicitudes pendientes recibe mensaje de estado vacío
      const emptyReqs = await joinRequestsController.listMyRequests(USER_ALUMNO_3);
      recordTest('Épica 2', 'H.U 2.2', 'Listar solicitudes sin pendientes retorna mensaje "No hay solicitudes pendientes por revisar"', emptyReqs.total === 0 && emptyReqs.message === 'No hay solicitudes pendientes por revisar');

      // 3. Usuario no administrador intenta responder -> 403 Forbidden
      try {
        await joinRequestsController.respondToRequest(
          createdRequestId,
          { action: 'accepted' } as RespondJoinRequestDto,
          USER_ALUMNO_3,
        );
        recordTest('Épica 2', 'H.U 2.2', 'Usuario no administrador recibe 403 Forbidden al gestionar solicitudes', false, 'No lanzó 403');
      } catch (err: any) {
        const is403 = err instanceof ForbiddenException;
        recordTest('Épica 2', 'H.U 2.2', 'Usuario no administrador recibe 403 Forbidden al gestionar solicitudes', is403);
      }

      // 4. Aceptar la solicitud exitosamente
      const acceptRes = await joinRequestsController.respondToRequest(
        createdRequestId,
        { action: 'accepted' } as RespondJoinRequestDto,
        USER_ALUMNO_1,
      );
      recordTest('Épica 2', 'H.U 2.2', 'Aceptar solicitud actualiza status a "accepted" y registra respuesta', acceptRes.request.status === 'accepted');

      // Verificar que ALUMNO_2 ahora es miembro en PostgreSQL de forma atómica
      const memberInDb = await dataSource.query(`SELECT * FROM group_members WHERE group_id = '${existingGroupId}' AND user_id = '${USER_ALUMNO_2}';`);
      recordTest('Épica 2', 'H.U 2.2', 'Aceptar solicitud inserta al alumno en group_members de forma atómica', memberInDb.length > 0 && memberInDb[0].role === 'member');

      // Verificar que el estado del grupo ahora es my_status === 'member'
      const detailMember = await groupsController.getGroupDetail(existingGroupId, USER_ALUMNO_2);
      recordTest('Épica 2', 'H.U 2.2', 'Detalle de grupo refleja my_status = "member" para el nuevo integrante', detailMember.my_status === 'member');

      // 5. Idempotencia: intentar responder de nuevo a la solicitud aceptada -> 409 Conflict
      try {
        await joinRequestsController.respondToRequest(
          createdRequestId,
          { action: 'accepted' } as RespondJoinRequestDto,
          USER_ALUMNO_1,
        );
        recordTest('Épica 2', 'H.U 2.2', 'Responder a solicitud ya procesada lanza 409 Conflict (idempotencia)', false, 'No lanzó 409');
      } catch (err: any) {
        const is409 = err instanceof ConflictException;
        recordTest('Épica 2', 'H.U 2.2', 'Responder a solicitud ya procesada lanza 409 Conflict (idempotencia)', is409);
      }

      // 6. Prueba de rechazo: ALUMNO_3 solicita y el admin rechaza
      const req3 = await groupJoinRequestsController.createRequest(
        existingGroupId,
        { message: 'Quiero unirme también' } as CreateJoinRequestDto,
        USER_ALUMNO_3,
      );
      const rejectRes = await joinRequestsController.respondToRequest(
        req3.request.id,
        { action: 'rejected' } as RespondJoinRequestDto,
        USER_ALUMNO_1,
      );
      recordTest('Épica 2', 'H.U 2.2', 'Rechazar solicitud actualiza status a "rejected"', rejectRes.request.status === 'rejected');

      // Alumno rechazado no es miembro
      const member3InDb = await dataSource.query(`SELECT * FROM group_members WHERE group_id = '${existingGroupId}' AND user_id = '${USER_ALUMNO_3}';`);
      recordTest('Épica 2', 'H.U 2.2', 'Solicitud rechazada no ingresa a group_members', member3InDb.length === 0);
    } catch (err: any) {
      recordTest('Épica 2', 'H.U 2.2', 'Gestionar solicitudes de unión', false, err.message);
    }

    // =========================================================================
    // SECCIÓN 3: ÉPICA 3 — GESTIONAR SEGURIDAD (AUTH & SESIÓN)
    // =========================================================================
    console.log('\n----------------------------------------------------------------------');
    console.log('EPICA 3: GESTIONAR SEGURIDAD (Sprint 2 & 4)');
    console.log('----------------------------------------------------------------------');

    // H.U 3.7: Cerrar sesión y revocación de tokens
    try {
      const expTimestamp = Math.floor(Date.now() / 1000) + 3600; // expira en 1 hora
      const testToken = generateJwt(
        { sub: USER_ALUMNO_1, email: 'alumno1@aloe.ulima.edu.pe', role: 'student', exp: expTimestamp },
        jwtSecret,
      );

      // 1. Validar token activo antes de logout
      const payloadBefore = await authService.validateToken(testToken);
      recordTest('Épica 3', 'H.U 3.7', 'Token JWT válido es verificado correctamente por el servicio de Auth', payloadBefore.sub === USER_ALUMNO_1);

      // 2. Cerrar sesión (Logout)
      const dummyRes: any = { clearCookie: () => {} };
      const logoutResult = await authController.logout({ token: testToken } as any, dummyRes);
      recordTest('Épica 3', 'H.U 3.7', 'POST /auth/logout cierra sesión exitosamente y retorna confirmación', logoutResult.message === 'Sesión cerrada correctamente');

      // 3. Verificar que el hash se almacenó en PostgreSQL (tabla revoked_tokens)
      const revokedInDb = await dataSource.query(`SELECT * FROM revoked_tokens WHERE user_id = '${USER_ALUMNO_1}';`);
      recordTest('Épica 3', 'H.U 3.7', 'Token revocado queda persistido en PostgreSQL en revoked_tokens', revokedInDb.length > 0);

      // 4. Intentar reutilizar el token revocado -> 401 Unauthorized
      try {
        await authService.validateToken(testToken);
        recordTest('Épica 3', 'H.U 3.7', 'Uso posterior de un token revocado es rechazado con 401 Unauthorized', false, 'No lanzó 401');
      } catch (err: any) {
        const is401 = err instanceof UnauthorizedException;
        recordTest('Épica 3', 'H.U 3.7', 'Uso posterior de un token revocado es rechazado con 401 Unauthorized', is401);
      }

      // 5. Token expirado o malformado -> 401 Unauthorized
      try {
        await authService.validateToken('token.invalido.malformado');
        recordTest('Épica 3', 'H.U 3.7', 'Token malformado es rechazado con 401 Unauthorized', false, 'No lanzó 401');
      } catch (err: any) {
        const is401 = err instanceof UnauthorizedException;
        recordTest('Épica 3', 'H.U 3.7', 'Token malformado es rechazado con 401 Unauthorized', is401);
      }
    } catch (err: any) {
      recordTest('Épica 3', 'H.U 3.7', 'Cerrar sesión y validación de seguridad', false, err.message);
    }

  } finally {
    // Limpieza posterior de datos de prueba
    console.log('\n[INFO] Limpiando datos temporales de prueba en PostgreSQL...');
    try {
      if (createdPostId) {
        await dataSource.query(`DELETE FROM publications WHERE id = '${createdPostId}';`);
      }
      if (createdPostTutoringId) {
        await dataSource.query(`DELETE FROM publications WHERE id = '${createdPostTutoringId}';`);
      }
      if (groupAutoId) {
        await dataSource.query(`DELETE FROM group_members WHERE group_id = '${groupAutoId}';`);
        await dataSource.query(`DELETE FROM groups WHERE id = '${groupAutoId}';`);
      }
      await dataSource.query(`DELETE FROM join_requests WHERE requester_id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}') OR group_id = '${existingGroupId}';`);
      await dataSource.query(`DELETE FROM group_members WHERE user_id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}') OR group_id = '${existingGroupId}';`);
      await dataSource.query(`DELETE FROM publications WHERE user_id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}');`);
      await dataSource.query(`DELETE FROM groups WHERE admin_id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}') OR id = '${existingGroupId}';`);
      await dataSource.query(`DELETE FROM profiles WHERE user_id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}');`);
      await dataSource.query(`DELETE FROM revoked_tokens WHERE user_id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}');`);
      await dataSource.query(`DELETE FROM users WHERE id IN ('${USER_ALUMNO_1}', '${USER_ALUMNO_2}', '${USER_ALUMNO_3}');`);
      await dataSource.query(`DELETE FROM courses WHERE name IN ('Ingeniería de Software E2E', 'Cálculo Avanzado E2E');`);
    } catch (cleanupErr: any) {
      console.warn('Advertencia en limpieza:', cleanupErr.message);
    }

    await app.close();
  }

  // =========================================================================
  // REPORTE FINAL CONSOLIDADO
  // =========================================================================
  console.log('\n======================================================================');
  console.log('REPORTE CONSOLIDADO DE PRUEBAS DE INTEGRACION END-TO-END');
  console.log('======================================================================');
  
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  const epics = [...new Set(results.map((r) => r.epic))];
  for (const ep of epics) {
    const epResults = results.filter((r) => r.epic === ep);
    const epPassed = epResults.filter((r) => r.passed).length;
    console.log(`\n-> ${ep}: ${epPassed}/${epResults.length} Criterios Aprobados`);
    for (const res of epResults) {
      const icon = res.passed ? '  [PASS]' : '  [FAIL]';
      console.log(`${icon} [${res.hu}] ${res.criterion}`);
    }
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL CRITERIOS EVALUADOS : ${total}`);
  console.log(`EXITOSOS ([PASS])        : ${passed}`);
  console.log(`FALLIDOS ([FAIL])        : ${failed}`);
  console.log(`TASA DE ÉXITO             : ${((passed / total) * 100).toFixed(1)}%`);
  console.log('----------------------------------------------------------------------');

  if (failed === 0) {
    console.log('\n[SUCCESS] Todos los criterios de aceptacion E2E pasaron al 100%.');
  } else {
    console.error(`\n[ERROR] Se detectaron ${failed} fallos en los criterios de aceptación.`);
    process.exit(1);
  }
}

runMasterE2ETests().catch((err) => {
  console.error('Error fatal ejecutando suite E2E:', err);
  process.exit(1);
});
