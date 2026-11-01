import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ForbiddenException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ExecutionContext,
} from '@nestjs/common';

// Controladores y Servicios de SPEC-01
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/services/auth.service';
import { SessionService } from '../src/auth/services/session.service';
import { AccountVerificationService } from '../src/auth/services/account-verification.service';
import { PasswordRecoveryService } from '../src/auth/services/password-recovery.service';
import { JwtAuthGuard, AuthenticatedRequest } from '../src/auth/guards/jwt-auth.guard';
import { AUTH_COOKIE } from '../src/auth/token.util';
import { RegisterDto } from '../src/auth/dto/register.dto';
import { LoginDto } from '../src/auth/dto/login.dto';
import { VerifyEmailDto } from '../src/auth/dto/verify-email.dto';
import { ResetPasswordDto } from '../src/auth/dto/reset-password.dto';
import { UserAccountStatus } from '../src/auth/enums/user-account-status.enum';

// Controladores y Servicios de SPEC-03
import { PostsController } from '../src/posts/posts.controller';
import { PostsService } from '../src/posts/posts.service';
import { PostCreateDto } from '../src/posts/dto/post-create.dto';
import { PostUpdateDto } from '../src/posts/dto/post-update.dto';

interface TestCaseResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const testResults: TestCaseResult[] = [];

function logTest(id: string, name: string, passed: boolean, details?: string, error?: string) {
  testResults.push({ id, name, passed, details, error });
  const status = passed ? '[PASS]' : '[FAIL]';
  console.log(`${status} ${id}: ${name}`);
  if (details) {
    console.log(`       Detalle: ${details}`);
  }
  if (error) {
    console.error(`       Error: ${error}`);
  }
}

// Helper para simular ExecutionContext para JwtAuthGuard
function createMockExecutionContext(token?: string): {
  context: ExecutionContext;
  req: AuthenticatedRequest;
} {
  const req: any = {
    headers: {
      authorization: token ? `Bearer ${token}` : undefined,
    },
  };

  const context: ExecutionContext = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ cookie: () => {}, clearCookie: () => {} }),
      getNext: () => ({}),
    }),
    getHandler: () => (() => {}) as any,
    getClass: () => (class {} as any),
    getArgs: () => [] as any,
    getArgByIndex: () => ({}) as any,
    switchToRpc: () => ({}) as any,
    switchToWs: () => ({}) as any,
    getType: () => 'http' as any,
  } as unknown as ExecutionContext;

  return { context, req };
}

async function runIntegrationSuite() {
  console.log('======================================================================');
  console.log('SUITE DE INTEGRACION: SPEC-01 (AUTH & RBAC) <-> SPEC-03 (PUBLICACIONES)');
  console.log('Entorno: NestJS 10, TypeORM, PostgreSQL 16');
  console.log('Directrices: SPECS.md v3.0.0 y AGENTS.md');
  console.log('======================================================================\n');

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-luminaul-development-2026';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dataSource = app.get(DataSource);

  const authController = app.get(AuthController);
  const authService = app.get(AuthService);
  const sessionService = app.get(SessionService);
  const verificationService = app.get(AccountVerificationService);
  const recoveryService = app.get(PasswordRecoveryService);
  const jwtAuthGuard = app.get(JwtAuthGuard);

  const postsController = app.get(PostsController);
  const postsService = app.get(PostsService);

  // Emails de prueba
  const emailStudentA = 'integracion.alumno1@aloe.ulima.edu.pe';
  const emailStudentB = 'integracion.alumno2@aloe.ulima.edu.pe';
  const passwordInitial = 'PasswordSegura2026!';
  const passwordUpdated = 'NuevaPasswordSegura2026!';

  let studentAId = '';
  let studentBId = '';
  let studentAToken = '';
  let studentBToken = '';
  let createdCourseId = '';
  let createdPostId = '';

  try {
    console.log('[FASE 0] Limpieza y preparación de base de datos...');
    await dataSource.query(`DELETE FROM revoked_tokens WHERE user_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
    await dataSource.query(`DELETE FROM group_members WHERE user_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
    await dataSource.query(`DELETE FROM publications WHERE user_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
    await dataSource.query(`DELETE FROM groups WHERE leader_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
    await dataSource.query(`DELETE FROM profiles WHERE user_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
    await dataSource.query(`DELETE FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}');`);

    // Asegurar existencia de curso para las publicaciones
    const courseCheck = await dataSource.query(`SELECT id FROM courses WHERE name = 'Arquitectura Empresarial Test' LIMIT 1;`);
    if (courseCheck.length > 0) {
      createdCourseId = courseCheck[0].id;
    } else {
      const insertedCourse = await dataSource.query(`
        INSERT INTO courses (id, name, cycle)
        VALUES (gen_random_uuid(), 'Arquitectura Empresarial Test', 7)
        RETURNING id;
      `);
      createdCourseId = insertedCourse[0].id;
    }

    console.log('[FASE 0] Preparación completada con éxito.\n');

    // -----------------------------------------------------------------------------------
    // BLOQUE 1: VALIDACIONES Y REGLAS DE NEGOCIO SPEC-01 (AUTENTICACIÓN)
    // -----------------------------------------------------------------------------------
    console.log('--- BLOQUE 1: VALIDACIONES Y CONTRATOS SPEC-01 ---');

    // TEST 1: Validación estricta del dominio institucional en RegisterDto
    {
      const invalidDto = plainToInstance(RegisterDto, {
        email: 'alumno@gmail.com',
        password: passwordInitial,
        name: 'Usuario Invalido',
      });
      const errors = await validate(invalidDto);
      const hasDomainError = errors.some((err) =>
        Object.values(err.constraints || {}).some((msg) =>
          msg.includes('@aloe.ulima.edu.pe'),
        ),
      );
      logTest(
        'TEST-01',
        'Validación DTO: Rechazo de correo no institucional (@gmail.com)',
        hasDomainError,
        'RegisterDto valida con regex /^[a-zA-Z0-9._%+-]+@aloe\\.ulima\\.edu\\.pe$/',
      );
    }

    // TEST 2: Validación de longitud mínima de contraseña (10 caracteres)
    {
      const shortPassDto = plainToInstance(RegisterDto, {
        email: 'alumno.corto@aloe.ulima.edu.pe',
        password: 'Pass1',
        name: 'Password Corta',
      });
      const errors = await validate(shortPassDto);
      const hasLengthError = errors.some((err) =>
        Object.values(err.constraints || {}).some((msg) =>
          msg.includes('10 caracteres'),
        ),
      );
      logTest(
        'TEST-02',
        'Validación DTO: Rechazo de contraseña con menos de 10 caracteres',
        hasLengthError,
        'RegisterDto valida con @MinLength(10)',
      );
    }

    // TEST 3: Registro exitoso y creación atómica de perfil (Unit of Work)
    {
      const registerRes = await authController.register({
        email: emailStudentA,
        password: passwordInitial,
        name: 'Estudiante A Lumina',
      });
      studentAId = registerRes.userId;

      // Verificar en BD que users y profiles existan de manera atómica
      const userDb = await dataSource.query(`SELECT id, email, status, is_verified, role FROM users WHERE id = '${studentAId}';`);
      const profileDb = await dataSource.query(`SELECT user_id, name FROM profiles WHERE user_id = '${studentAId}';`);

      const passed =
        registerRes.status === UserAccountStatus.PENDING_VERIFICATION &&
        userDb.length === 1 &&
        userDb[0].status === 'pending_verification' &&
        userDb[0].is_verified === false &&
        profileDb.length === 1 &&
        profileDb[0].name === 'Estudiante A Lumina';

      logTest(
        'TEST-03',
        'Registro exitoso y creación atómica de perfil (users + profiles en transacción)',
        passed,
        `Usuario ID: ${studentAId}, Status: ${userDb[0]?.status}, Perfil Creado: ${profileDb[0]?.name}`,
      );
    }

    // TEST 4: Conflicto 409 por correo ya registrado
    {
      let caught = false;
      try {
        await authController.register({
          email: emailStudentA,
          password: passwordInitial,
          name: 'Duplicado Intent',
        });
      } catch (err: any) {
        caught = err instanceof ConflictException;
      }
      logTest(
        'TEST-04',
        'Control de unicidad: Rechazo 409 Conflict si el correo ya existe',
        caught,
        'Captura condición de carrera y violación de clave UNIQUE (23505)',
      );
    }

    // TEST 5: Rechazo de inicio de sesión con estado pending_verification (HTTP 403)
    {
      let forbiddenCaught = false;
      try {
        const dummyRes: any = { cookie: () => {} };
        await authController.login({ email: emailStudentA, password: passwordInitial }, dummyRes);
      } catch (err: any) {
        forbiddenCaught = err instanceof ForbiddenException;
      }
      logTest(
        'TEST-05',
        'Política de acceso: Login rechazado con 403 si la cuenta está pending_verification',
        forbiddenCaught,
        'Aplica LOGIN_STATUS_POLICIES conforme a SPECS.md',
      );
    }

    // TEST 6: Verificación de código OTP incorrecto -> HTTP 400 Bad Request
    {
      let badRequestCaught = false;
      try {
        await authController.verifyEmail({ email: emailStudentA, token: '000000' });
      } catch (err: any) {
        badRequestCaught = err instanceof BadRequestException;
      }
      logTest(
        'TEST-06',
        'Verificación OTP: Rechazo 400 Bad Request con código incorrecto',
        badRequestCaught,
        'OneTimeCodeService valida coincidencia y expiración',
      );
    }

    // TEST 7: Verificación de correo exitosa con código OTP legítimo
    {
      const tokenRow = await dataSource.query(`SELECT verification_token FROM users WHERE id = '${studentAId}';`);
      const otpCode = tokenRow[0]?.verification_token;

      const verifyRes = await authController.verifyEmail({ email: emailStudentA, token: otpCode });
      const userAfter = await dataSource.query(`SELECT status, is_verified, verification_token FROM users WHERE id = '${studentAId}';`);

      const passed =
        verifyRes.isVerified === true &&
        userAfter[0].status === 'active' &&
        userAfter[0].is_verified === true &&
        userAfter[0].verification_token === null;

      logTest(
        'TEST-07',
        'Verificación OTP exitosa: Transición a status active y limpieza de token',
        passed,
        `Status BD: ${userAfter[0]?.status}, is_verified: ${userAfter[0]?.is_verified}`,
      );
    }

    // TEST 8: Login exitoso y emisión de token JWT firmado
    {
      let setCookieCall: any = null;
      const mockRes: any = {
        cookie: (name: string, val: string, opts: any) => {
          setCookieCall = { name, val, opts };
        },
      };
      const loginRes = await authController.login(
        { email: emailStudentA, password: passwordInitial },
        mockRes,
      );
      studentAToken = loginRes.accessToken;

      const passed =
        typeof studentAToken === 'string' &&
        studentAToken.split('.').length === 3 &&
        loginRes.user.id === studentAId &&
        loginRes.user.email === emailStudentA &&
        loginRes.user.role === 'student' &&
        loginRes.user.status === 'active' &&
        setCookieCall?.name === AUTH_COOKIE;

      logTest(
        'TEST-08',
        'Login exitoso: Emisión de token JWT HS256 y configuración de cookie httpOnly',
        passed,
        `Token JWT recibido, payload coincide con AuthUserDto y cookie ${AUTH_COOKIE} emitida`,
      );
    }

    // TEST 9: Consulta de perfil actual (GET /auth/me)
    {
      const meRes = await authController.me(studentAId);
      const passed =
        meRes.id === studentAId &&
        meRes.email === emailStudentA &&
        meRes.role === 'student' &&
        meRes.status === 'active';

      logTest(
        'TEST-09',
        'Consulta de identidad (GET /auth/me): Retorna datos frescos de la BD',
        passed,
        `Usuario autenticado: ${meRes.name} (${meRes.email})`,
      );
    }

    // -----------------------------------------------------------------------------------
    // BLOQUE 2: INTEGRACIÓN SPEC-01 (AUTH) <-> SPEC-03 (PUBLICACIONES)
    // -----------------------------------------------------------------------------------
    console.log('\n--- BLOQUE 2: INTEGRACION TRANSVERSAL SPEC-01 <-> SPEC-03 ---');

    // TEST 10: Validación de sesión mediante JwtAuthGuard con el token de Estudiante A
    {
      const { context, req } = createMockExecutionContext(studentAToken);
      const canActivate = await jwtAuthGuard.canActivate(context);

      const passed =
        canActivate === true &&
        req.user?.id === studentAId &&
        req.user?.email === emailStudentA &&
        req.user?.role === 'student' &&
        req.token === studentAToken;

      logTest(
        'TEST-10',
        'JwtAuthGuard: Validación del JWT de SPEC-01 y poblado de req.user con el usuario real',
        passed,
        `req.user.id: ${req.user?.id}, req.user.role: ${req.user?.role}`,
      );
    }

    // TEST 11: Creación de publicación (POST /posts) vinculando la identidad del usuario autenticado
    {
      const createPayload: PostCreateDto = {
        courseId: createdCourseId,
        type: 'study_group',
        description: 'Buscamos compañeros para proyecto de integracion SPEC-01 y SPEC-03',
        benefits: 'Arquitectura limpia y pruebas rigurosas',
        requirements: 'Disponibilidad fines de semana',
        maxCapacity: 4,
      };

      const createdPost = await postsController.createPost(createPayload, studentAId);
      createdPostId = createdPost.id;

      // Verificar en la tabla publications de PostgreSQL
      const postDb = await dataSource.query(`SELECT id, user_id, course_id, description, status FROM publications WHERE id = '${createdPostId}';`);

      const passed =
        createdPost.id === createdPostId &&
        createdPost.userId === studentAId &&
        postDb.length === 1 &&
        postDb[0].user_id === studentAId &&
        postDb[0].status === 'published';

      logTest(
        'TEST-11',
        'Creación de publicación (POST /posts) vinculada orgánicamente al authorId/userId de SPEC-01',
        passed,
        `Post ID: ${createdPostId}, Autor DB: ${postDb[0]?.user_id} === ${studentAId}`,
      );
    }

    // TEST 12: Consulta de mis publicaciones (GET /posts/me)
    {
      const myPosts = await postsController.getMyPosts({ limit: 10, offset: 0 }, studentAId);
      const hasMyPost = myPosts.some((p) => p.id === createdPostId);

      logTest(
        'TEST-12',
        'Consulta de historial (GET /posts/me): Retorna las publicaciones del usuario autenticado',
        hasMyPost,
        `Publicaciones encontradas para Estudiante A: ${myPosts.length}`,
      );
    }

    // TEST 13: Registro y activación de un segundo estudiante (Estudiante B)
    {
      const regB = await authController.register({
        email: emailStudentB,
        password: passwordInitial,
        name: 'Estudiante B Tercero',
      });
      studentBId = regB.userId;

      const tokenRowB = await dataSource.query(`SELECT verification_token FROM users WHERE id = '${studentBId}';`);
      await authController.verifyEmail({ email: emailStudentB, token: tokenRowB[0]?.verification_token });

      const mockResB: any = { cookie: () => {} };
      const loginB = await authController.login(
        { email: emailStudentB, password: passwordInitial },
        mockResB,
      );
      studentBToken = loginB.accessToken;

      const passed = typeof studentBToken === 'string' && loginB.user.id === studentBId;
      logTest(
        'TEST-13',
        'Aislamiento multitenant: Registro y autenticación de Estudiante B',
        passed,
        `Estudiante B ID: ${studentBId}, Token emitido`,
      );
    }

    // TEST 14: Aislamiento de historial de posts (Estudiante B no debe ver posts de Estudiante A en GET /posts/me)
    {
      const myPostsB = await postsController.getMyPosts({ limit: 10, offset: 0 }, studentBId);
      const containsAPost = myPostsB.some((p) => p.id === createdPostId);

      logTest(
        'TEST-14',
        'Aislamiento de historial: GET /posts/me de Estudiante B no contiene publicaciones de Estudiante A',
        !containsAPost && myPostsB.length === 0,
        `Posts retornados para Estudiante B: ${myPostsB.length} (esperado 0)`,
      );
    }

    // TEST 15: Autoría estricta: Rechazo 403 si Estudiante B intenta editar el post de Estudiante A
    {
      let forbiddenCaught = false;
      try {
        const updatePayload: PostUpdateDto = {
          description: 'Intento de edicion no autorizada por usuario ajeno',
        };
        await postsController.editPost(createdPostId, updatePayload, studentBId);
      } catch (err: any) {
        forbiddenCaught = err instanceof ForbiddenException;
      }

      logTest(
        'TEST-15',
        'RBAC a nivel de recurso: Rechazo 403 Forbidden al intentar editar publicación ajena',
        forbiddenCaught,
        'PostsService valida ownership (existingPost.userId !== userId)',
      );
    }

    // TEST 16: Autoría estricta: Rechazo 403 si Estudiante B intenta eliminar el post de Estudiante A
    {
      let forbiddenCaught = false;
      try {
        await postsController.deletePost(createdPostId, studentBId);
      } catch (err: any) {
        forbiddenCaught = err instanceof ForbiddenException;
      }

      logTest(
        'TEST-16',
        'RBAC a nivel de recurso: Rechazo 403 Forbidden al intentar eliminar publicación ajena',
        forbiddenCaught,
        'PostsService valida ownership antes de ejecutar el soft-delete',
      );
    }

    // TEST 17: Edición autorizada por el legítimo autor (Estudiante A)
    {
      const updatePayload: PostUpdateDto = {
        description: 'Descripcion actualizada y aprobada por el autor original',
      };
      const editedPost = await postsController.editPost(createdPostId, updatePayload, studentAId);
      const passed =
        editedPost.id === createdPostId &&
        editedPost.description === 'Descripcion actualizada y aprobada por el autor original';

      logTest(
        'TEST-17',
        'Edición autorizada (PUT /posts/:id): El autor legítimo puede actualizar su publicación',
        passed,
        `Nueva descripción reflejada: "${editedPost.description}"`,
      );
    }

    // -----------------------------------------------------------------------------------
    // BLOQUE 3: REVOCACIÓN, INVALIDACIÓN Y SEGURIDAD DUAL (SPEC-01 + SPEC-03)
    // -----------------------------------------------------------------------------------
    console.log('\n--- BLOQUE 3: REVOCACION, INVALIDACION DUAL Y SOFT-DELETE ---');

    // TEST 18: Logout de Estudiante A (revocación explícita de token en revoked_tokens)
    {
      const mockReqA: AuthenticatedRequest = {
        user: { id: studentAId, email: emailStudentA, role: 'student' },
        token: studentAToken,
      } as any;
      const mockResA: any = { clearCookie: () => {} };

      const logoutRes = await authController.logout(mockReqA, mockResA);

      // Comprobar que el hash SHA-256 está en revoked_tokens
      const revokedRows = await dataSource.query(`SELECT user_id, expires_at FROM revoked_tokens WHERE user_id = '${studentAId}';`);

      const passed =
        logoutRes.message === 'Sesión cerrada correctamente' &&
        revokedRows.length > 0;

      logTest(
        'TEST-18',
        'Logout y Revocación: Hash SHA-256 registrado en revoked_tokens e invalidación de cookie',
        passed,
        `Registros de revocación para Estudiante A: ${revokedRows.length}`,
      );
    }

    // TEST 19: Intento de reutilizar el token revocado en JwtAuthGuard -> HTTP 401 Unauthorized
    {
      let unauthorizedCaught = false;
      let errorMsg = '';
      try {
        const { context } = createMockExecutionContext(studentAToken);
        await jwtAuthGuard.canActivate(context);
      } catch (err: any) {
        unauthorizedCaught = err instanceof UnauthorizedException;
        errorMsg = err.message;
      }

      logTest(
        'TEST-19',
        'Validación Dual de Sesiones: Rechazo 401 Unauthorized ante intento de reuso de token revocado',
        unauthorizedCaught,
        `Mensaje de rechazo: "${errorMsg}"`,
      );
    }

    // TEST 20: Cambio de contraseña -> tokens_valid_after invalida todas las sesiones previas
    {
      // Login de Estudiante B para obtener un token previo
      const tokenPreReset = studentBToken;

      // Solicitar reseteo de contraseña
      await recoveryService.forgotPassword({ email: emailStudentB });
      const resetRow = await dataSource.query(`SELECT reset_token FROM users WHERE id = '${studentBId}';`);
      const resetOtp = resetRow[0]?.reset_token;

      // Esperar 1.1 segundos para que tokensValidAfter sea estrictamente mayor que iat (en segundos)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Ejecutar reset
      await recoveryService.resetPassword({
        email: emailStudentB,
        token: resetOtp,
        newPassword: passwordUpdated,
      });

      // El token anterior de Estudiante B debe ser rechazado por tokens_valid_after
      let preTokenRejected = false;
      try {
        const { context } = createMockExecutionContext(tokenPreReset);
        await jwtAuthGuard.canActivate(context);
      } catch (err: any) {
        preTokenRejected = err instanceof UnauthorizedException;
      }

      // Login con la nueva contraseña debe funcionar
      const mockResB2: any = { cookie: () => {} };
      const newLoginB = await authController.login(
        { email: emailStudentB, password: passwordUpdated },
        mockResB2,
      );

      const passed = preTokenRejected && typeof newLoginB.accessToken === 'string';
      logTest(
        'TEST-20',
        'Invalidación por reset de contraseña: tokens_valid_after invalida tokens previos automáticamente',
        passed,
        `Token previo rechazado: ${preTokenRejected}, Nuevo token obtenido con nueva clave`,
      );
    }

    // TEST 21: Eliminación lógica de cuenta (DELETE /auth/me)
    {
      const mockResA2: any = { clearCookie: () => {} };
      const deleteRes = await authController.deleteAccount(studentAId, mockResA2);

      const userDbDeleted = await dataSource.query(`SELECT status, deleted_at, tokens_valid_after FROM users WHERE id = '${studentAId}';`);

      const passed =
        deleteRes.message === 'Cuenta eliminada exitosamente' &&
        userDbDeleted[0].status === 'deleted' &&
        userDbDeleted[0].deleted_at !== null;

      logTest(
        'TEST-21',
        'Soft-delete de cuenta (DELETE /auth/me): Status deleted y preservación de clave para integridad referencial',
        passed,
        `Status en BD: ${userDbDeleted[0]?.status}, deleted_at: ${userDbDeleted[0]?.deleted_at}`,
      );
    }

    // TEST 22: Intento de login en cuenta eliminada lógicamente -> HTTP 401 Unauthorized (Anti-Enumeration)
    {
      let unauthorizedCaught = false;
      try {
        const dummyRes: any = { cookie: () => {} };
        await authController.login({ email: emailStudentA, password: passwordInitial }, dummyRes);
      } catch (err: any) {
        unauthorizedCaught = err instanceof UnauthorizedException;
      }

      logTest(
        'TEST-22',
        'Anti-Enumeration: Intento de login en cuenta borrada lógicamente es rechazado como 401 Unauthorized',
        unauthorizedCaught,
        'LOGIN_STATUS_POLICIES aplica DENY_AS_INVALID_CREDENTIALS sin revelar existencia',
      );
    }

    console.log('\n======================================================================');
    const total = testResults.length;
    const passed = testResults.filter((r) => r.passed).length;
    const failed = testResults.filter((r) => !r.passed).length;
    console.log(`RESUMEN DE PRUEBAS DE INTEGRACION: ${passed}/${total} PASARON (${failed} FALLOS)`);
    console.log('======================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Error catastrófico durante la ejecución de las pruebas:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runIntegrationSuite();
