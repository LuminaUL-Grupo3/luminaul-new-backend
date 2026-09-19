import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { HealthController } from '../src/health/health.controller';
import { CoursesController } from '../src/courses/courses.controller';
import { PostsService } from '../src/posts/posts.service';
import { PostsController } from '../src/posts/posts.controller';
import { DataSource } from 'typeorm';
import { DEMO_USER_ID } from '../src/common/decorators/current-user.decorator';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PostCreateDto } from '../src/posts/dto/post-create.dto';
import { PostFilterQueryDto } from '../src/posts/dto/post-query.dto';
import {
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';

const OTHER_USER_ID = '11111111-2222-3333-4444-555555555555';
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

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 INICIANDO SUITE DE PRUEBAS DE HISTORIAS DE USUARIO (SPRINT 1)');
  console.log('======================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const dataSource = app.get(DataSource);
  const healthController = app.get(HealthController);
  const coursesController = app.get(CoursesController);
  const postsService = app.get(PostsService);
  const postsController = app.get(PostsController);

  let course1Id = '';
  let course2Id = '';
  let createdPostId = '';

  try {
    // 0. Preparar Semillas en BD (Usuarios y Cursos de prueba)
    console.log('📦 Sembrando datos iniciales en PostgreSQL para pruebas...');

    // Limpiar publicaciones y grupos previos de prueba si existen
    await dataSource.query(`DELETE FROM join_requests;`);
    await dataSource.query(`DELETE FROM group_members;`);
    await dataSource.query(`DELETE FROM publications WHERE user_id IN ('${DEMO_USER_ID}', '${OTHER_USER_ID}');`);
    await dataSource.query(`DELETE FROM groups WHERE admin_id IN ('${DEMO_USER_ID}', '${OTHER_USER_ID}');`);
    await dataSource.query(`DELETE FROM profiles WHERE user_id IN ('${DEMO_USER_ID}', '${OTHER_USER_ID}');`);
    await dataSource.query(`DELETE FROM users WHERE id IN ('${DEMO_USER_ID}', '${OTHER_USER_ID}');`);
    await dataSource.query(`DELETE FROM courses WHERE name IN ('Cálculo I', 'Estructuras de Datos');`);

    // Insertar usuarios
    await dataSource.query(`
      INSERT INTO users (id, email, password_hash, role, status, is_verified, created_at, updated_at)
      VALUES 
        ('${DEMO_USER_ID}', 'demo.student@ulima.edu.pe', 'hash123', 'student', 'active', true, NOW(), NOW()),
        ('${OTHER_USER_ID}', 'other.student@ulima.edu.pe', 'hash456', 'student', 'active', true, NOW(), NOW());
    `);

    // Insertar perfiles
    await dataSource.query(`
      INSERT INTO profiles (user_id, name, bio, major, academic_cycle, profile_photo_url, updated_at)
      VALUES 
        ('${DEMO_USER_ID}', 'Martín Vizcarra', 'Estudiante de Ing. de Sistemas', 'Ingeniería de Sistemas', '5', 'https://avatar.test/martin.png', NOW()),
        ('${OTHER_USER_ID}', 'Juan Pérez', 'Estudiante de Industrial', 'Ingeniería Industrial', '3', NULL, NOW());
    `);

    // Insertar cursos
    const insertedCourses = await dataSource.query(`
      INSERT INTO courses (id, name, cycle)
      VALUES 
        (gen_random_uuid(), 'Cálculo I', 1),
        (gen_random_uuid(), 'Estructuras de Datos', 3)
      RETURNING id, name;
    `);
    course1Id = insertedCourses[0].id;
    course2Id = insertedCourses[1].id;
    console.log(`   Cursos creados: Cálculo I (${course1Id}), Estructuras de Datos (${course2Id})\n`);

    // ==========================================
    // PRUEBA: GET /health
    // ==========================================
    try {
      const health = healthController.healthCheck();
      const passed = health.status === 'ok' && health.service === 'luminaul-backend';
      recordTest('Health', 'GET /health debe retornar status ok y nombre del servicio', passed);
    } catch (err: any) {
      recordTest('Health', 'GET /health', false, err.message);
    }

    // ==========================================
    // PRUEBA: GET /courses
    // ==========================================
    try {
      const courses = await coursesController.getAllCourses();
      const passed = courses.length >= 2 && courses[0].name <= courses[1].name;
      recordTest('Courses', 'GET /courses debe retornar cursos ordenados alfabéticamente', passed);
    } catch (err: any) {
      recordTest('Courses', 'GET /courses', false, err.message);
    }

    // ==========================================
    // VALIDACIONES DE DTO
    // ==========================================
    try {
      const invalidTypeDto = plainToInstance(PostCreateDto, {
        course_id: course1Id,
        type: 'invalido_tipo',
        description: 'Texto de prueba',
      });
      const errorsType = await validate(invalidTypeDto);
      const hasTypeError = errorsType.some((e) => e.property === 'type');
      recordTest('DTO Validation', 'PostCreateDto rechaza tipos no permitidos (solo study_group o tutoring)', hasTypeError);

      const blankDescDto = plainToInstance(PostCreateDto, {
        course_id: course1Id,
        type: 'tutoring',
        description: '     ',
      });
      const errorsBlank = await validate(blankDescDto);
      const hasBlankError = errorsBlank.some((e) => e.property === 'description');
      recordTest('DTO Validation', 'PostCreateDto rechaza descripciones vacías o con solo espacios en blanco', hasBlankError);
    } catch (err: any) {
      recordTest('DTO Validation', 'Validaciones de DTO', false, err.message);
    }

    // ==========================================
    // H.U 1.1: CREAR PUBLICACIÓN (POST /posts)
    // ==========================================
    try {
      const newPost = await postsController.createPost(
        {
          course_id: course1Id,
          type: 'tutoring',
          description: 'Ofrezco tutoría para preparar la PC1 de Cálculo I.',
          benefits: 'Ejercicios resueltos y asesoría por Discord',
          requirements: 'Tener a la mano apuntes de clase',
        },
        DEMO_USER_ID,
      );

      createdPostId = newPost.id;
      const passed =
        newPost.id !== undefined &&
        newPost.user_id === DEMO_USER_ID &&
        newPost.course_id === course1Id &&
        newPost.group_id !== null &&
        newPost.status === 'published';

      recordTest('H.U 1.1', 'POST /posts crea publicación con grupo automático y status published', passed);

      // Verificar que el grupo automático se haya creado en BD
      const groupInDb = await dataSource.query(`SELECT * FROM groups WHERE id = '${newPost.group_id}';`);
      const groupPassed =
        groupInDb.length > 0 &&
        groupInDb[0].name === 'Grupo de Cálculo I' &&
        groupInDb[0].admin_id === DEMO_USER_ID;
      recordTest('H.U 1.1', 'Creación automática del grupo de estudio con admin_id del usuario', groupPassed);
    } catch (err: any) {
      recordTest('H.U 1.1', 'POST /posts caso exitoso', false, err.message);
    }

    // H.U 1.1: Intento con curso inexistente (debe lanzar 422 Unprocessable Entity)
    try {
      await postsController.createPost(
        {
          course_id: NON_EXISTENT_UUID,
          type: 'study_group',
          description: 'Grupo para curso que no existe',
        },
        DEMO_USER_ID,
      );
      recordTest('H.U 1.1', 'POST /posts rechaza curso inexistente con 422', false, 'No lanzó excepción');
    } catch (err: any) {
      const is422 = err instanceof UnprocessableEntityException;
      recordTest('H.U 1.1', 'POST /posts rechaza curso inexistente con 422 UnprocessableEntity', is422);
    }

    // H.U 1.1 Avanzada: Post de tutoría individual pura sin grupo
    try {
      const postWithoutGroup = await postsController.createPost(
        {
          course_id: course2Id,
          type: 'tutoring',
          description: 'Tutoría individual 1 a 1 de Estructuras de Datos.',
        },
        DEMO_USER_ID,
      );
      const passedNoGroup = postWithoutGroup.id !== undefined && postWithoutGroup.group_id === null;
      recordTest('H.U 1.1+', 'POST /posts permite crear publicaciones sin grupo cuando es tutoría pura', passedNoGroup);

      // Limpiar el post creado
      await dataSource.query(`DELETE FROM publications WHERE id = '${postWithoutGroup.id}';`);
    } catch (err: any) {
      recordTest('H.U 1.1+', 'POST /posts sin grupo', false, err.message);
    }

    // H.U 1.1 Avanzada: Post vinculado a un grupo ya existente
    try {
      // Obtenemos el grupo creado en la prueba anterior
      const existingGroupRow = await dataSource.query(`SELECT group_id FROM publications WHERE id = '${createdPostId}';`);
      const existingGroupId = existingGroupRow[0].group_id;

      const postWithExistingGroup = await postsController.createPost(
        {
          course_id: course1Id,
          type: 'study_group',
          description: 'Buscamos 2 integrantes adicionales para nuestro grupo.',
          group_id: existingGroupId,
        },
        DEMO_USER_ID,
      );
      const passedExisting =
        postWithExistingGroup.id !== undefined &&
        postWithExistingGroup.group_id === existingGroupId;
      recordTest('H.U 1.1+', 'POST /posts permite vincular la publicación a un grupo ya existente', passedExisting);

      // Limpiar este post secundario
      await dataSource.query(`DELETE FROM publications WHERE id = '${postWithExistingGroup.id}';`);
    } catch (err: any) {
      recordTest('H.U 1.1+', 'POST /posts con grupo existente', false, err.message);
    }

    // ==========================================
    // H.U 1.5: FEED DE PUBLICACIONES (GET /posts)
    // ==========================================
    try {
      const feed = await postsController.listPosts({});
      const foundPost = feed.find((p) => p.id === createdPostId);
      const passed =
        foundPost !== undefined &&
        foundPost.author.user_id === DEMO_USER_ID &&
        foundPost.author.name === 'Martín Vizcarra' &&
        foundPost.author.profile_photo_url === 'https://avatar.test/martin.png' &&
        foundPost.course.name === 'Cálculo I' &&
        foundPost.course.cycle === 1;

      recordTest('H.U 1.5', 'GET /posts muestra publicación en Feed con autor (perfil) y curso anidado', passed);
    } catch (err: any) {
      recordTest('H.U 1.5', 'GET /posts Feed', false, err.message);
    }

    // ==========================================
    // H.U 1.3: FILTROS DE PUBLICACIONES (GET /posts con query params)
    // ==========================================
    try {
      // Filtro por curso
      const byCourse = await postsController.listPosts({ course_id: course1Id, limit: 15, offset: 0 });
      const passedCourse = byCourse.some((p) => p.id === createdPostId);
      recordTest('H.U 1.3', 'GET /posts?course_id={id} filtra correctamente por curso', passedCourse);

      // Filtro por tipo
      const byType = await postsController.listPosts({ type: 'tutoring', limit: 15, offset: 0 });
      const passedType = byType.some((p) => p.id === createdPostId);
      recordTest('H.U 1.3', 'GET /posts?type=tutoring filtra correctamente por tipo', passedType);

      // Filtro por ciclo
      const byCycle = await postsController.listPosts({ cycle: 1, limit: 15, offset: 0 });
      const passedCycle = byCycle.some((p) => p.id === createdPostId);
      recordTest('H.U 1.3', 'GET /posts?cycle=1 filtra correctamente por ciclo', passedCycle);

      // Filtro sin coincidencias
      const noMatch = await postsController.listPosts({ cycle: 9, limit: 15, offset: 0 });
      const passedNoMatch = noMatch.length === 0;
      recordTest('H.U 1.3', 'GET /posts?cycle=9 retorna lista vacía cuando no hay coincidencias', passedNoMatch);
    } catch (err: any) {
      recordTest('H.U 1.3', 'Filtros de publicaciones', false, err.message);
    }

    // ==========================================
    // H.U 1.6: HISTORIAL PROPIO (GET /posts/me)
    // ==========================================
    try {
      const myPosts = await postsController.getMyPosts({ limit: 15, offset: 0 }, DEMO_USER_ID);
      const passedMy = myPosts.some((p) => p.id === createdPostId && p.course.name === 'Cálculo I');
      recordTest('H.U 1.6', 'GET /posts/me retorna el historial de publicaciones del usuario logueado', passedMy);

      const otherUserPosts = await postsController.getMyPosts({ limit: 15, offset: 0 }, OTHER_USER_ID);
      const passedOtherEmpty = otherUserPosts.length === 0;
      recordTest('H.U 1.6', 'GET /posts/me no expone publicaciones de otros usuarios', passedOtherEmpty);
    } catch (err: any) {
      recordTest('H.U 1.6', 'Historial propio', false, err.message);
    }

    // ==========================================
    // H.U 1.2: EDITAR PUBLICACIÓN (PUT /posts/:post_id)
    // ==========================================
    try {
      // Intento por un usuario no propietario -> 403 Forbidden
      try {
        await postsController.editPost(
          createdPostId,
          { description: 'Intento de edición no autorizada' },
          OTHER_USER_ID,
        );
        recordTest('H.U 1.2', 'PUT /posts/:id rechaza edición ajena con 403 Forbidden', false, 'No lanzó 403');
      } catch (err: any) {
        const is403 = err instanceof ForbiddenException;
        recordTest('H.U 1.2', 'PUT /posts/:id rechaza edición ajena con 403 Forbidden', is403);
      }

      // Edición legítima por el autor
      const updated = await postsController.editPost(
        createdPostId,
        { description: 'Descripción actualizada con éxito por el autor.', type: 'study_group' },
        DEMO_USER_ID,
      );
      const passedEdit =
        updated.description === 'Descripción actualizada con éxito por el autor.' &&
        updated.type === 'study_group';
      recordTest('H.U 1.2', 'PUT /posts/:id edita exitosamente la publicación cuando es el autor', passedEdit);

      // Intento de edición de post inexistente -> 404 Not Found
      try {
        await postsController.editPost(
          NON_EXISTENT_UUID,
          { description: 'No existe' },
          DEMO_USER_ID,
        );
        recordTest('H.U 1.2', 'PUT /posts/:id rechaza post inexistente con 404', false, 'No lanzó 404');
      } catch (err: any) {
        const is404 = err instanceof NotFoundException;
        recordTest('H.U 1.2', 'PUT /posts/:id rechaza post inexistente con 404 Not Found', is404);
      }
    } catch (err: any) {
      recordTest('H.U 1.2', 'Editar publicación', false, err.message);
    }

    // ==========================================
    // H.U 1.4: ELIMINAR PUBLICACIÓN (DELETE /posts/:post_id)
    // ==========================================
    try {
      // Intento de eliminación por un usuario no propietario -> 403 Forbidden
      try {
        await postsController.deletePost(createdPostId, OTHER_USER_ID);
        recordTest('H.U 1.4', 'DELETE /posts/:id rechaza eliminación ajena con 403 Forbidden', false, 'No lanzó 403');
      } catch (err: any) {
        const is403 = err instanceof ForbiddenException;
        recordTest('H.U 1.4', 'DELETE /posts/:id rechaza eliminación ajena con 403 Forbidden', is403);
      }

      // Eliminación legítima por el autor (soft delete)
      const deleteResult = await postsController.deletePost(createdPostId, DEMO_USER_ID);
      const passedDelete =
        deleteResult.success === true &&
        deleteResult.publication_id === createdPostId &&
        deleteResult.deleted_at !== undefined;
      recordTest('H.U 1.4', 'DELETE /posts/:id realiza soft delete retornando confirmación', passedDelete);

      // Verificar que en la base de datos se marcó deleted_at y status='hidden'
      const postInDb = await dataSource.query(`SELECT deleted_at, status FROM publications WHERE id = '${createdPostId}';`);
      const softDeletePassed =
        postInDb.length > 0 &&
        postInDb[0].deleted_at !== null &&
        postInDb[0].status === 'hidden';
      recordTest('H.U 1.4', 'Soft delete verificado en PostgreSQL (deleted_at NOT NULL, status = hidden)', softDeletePassed);

      // Verificar que ya NO aparezca en el Feed (H.U 1.5)
      const feedAfterDelete = await postsController.listPosts({});
      const notInFeed = !feedAfterDelete.some((p) => p.id === createdPostId);
      recordTest('H.U 1.5', 'Publicación eliminada desaparece automáticamente del Feed', notInFeed);

      // Intento de eliminación de post inexistente -> 404 Not Found
      try {
        await postsController.deletePost(NON_EXISTENT_UUID, DEMO_USER_ID);
        recordTest('H.U 1.4', 'DELETE /posts/:id rechaza post inexistente con 404', false, 'No lanzó 404');
      } catch (err: any) {
        const is404 = err instanceof NotFoundException;
        recordTest('H.U 1.4', 'DELETE /posts/:id rechaza post inexistente con 404 Not Found', is404);
      }
    } catch (err: any) {
      recordTest('H.U 1.4', 'Eliminar publicación', false, err.message);
    }

  } finally {
    // Limpieza de datos de prueba
    console.log('\n🧹 Limpiando registros temporales de prueba en BD...');
    if (createdPostId) {
      await dataSource.query(`DELETE FROM publications WHERE id = '${createdPostId}';`);
    }
    await dataSource.query(`DELETE FROM join_requests;`);
    await dataSource.query(`DELETE FROM group_members;`);
    await dataSource.query(`DELETE FROM publications WHERE user_id IN ('${DEMO_USER_ID}', '${OTHER_USER_ID}');`);
    await dataSource.query(`DELETE FROM groups WHERE admin_id IN ('${DEMO_USER_ID}', '${OTHER_USER_ID}');`);
    await dataSource.query(`DELETE FROM profiles WHERE user_id IN ('${DEMO_USER_ID}', '${OTHER_USER_ID}');`);
    await dataSource.query(`DELETE FROM users WHERE id IN ('${DEMO_USER_ID}', '${OTHER_USER_ID}');`);
    await dataSource.query(`DELETE FROM courses WHERE name IN ('Cálculo I', 'Estructuras de Datos');`);

    await app.close();
  }

  // Resumen Final
  console.log('\n======================================================');
  console.log('📊 RESUMEN FINAL DE PRUEBAS DEL SPRINT 1');
  console.log('======================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total Pruebas:  ${total}`);
  console.log(`Exitosas (✅):  ${passed}`);
  console.log(`Fallidas  (❌):  ${failed}`);

  if (failed === 0) {
    console.log('\n🎉 ¡TODAS LAS HISTORIAS DE USUARIO DEL SPRINT 1 PASARON AL 100%!');
  } else {
    console.error('\n⚠️ Hay pruebas que fallaron. Revisa los logs anteriores.');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Error fatal durante la ejecución de pruebas:', err);
  process.exit(1);
});
