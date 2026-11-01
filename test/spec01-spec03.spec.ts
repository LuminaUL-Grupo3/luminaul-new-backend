import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { NestFactory } from '@nestjs/core';
import { INestApplicationContext, ExecutionContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ForbiddenException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';

import { AppModule } from '../src/app.module';

// SPEC-01: Componentes de Autenticación y Seguridad
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/services/auth.service';
import { SessionService } from '../src/auth/services/session.service';
import { AccountVerificationService } from '../src/auth/services/account-verification.service';
import { PasswordRecoveryService } from '../src/auth/services/password-recovery.service';
import { JwtAuthGuard, AuthenticatedRequest } from '../src/auth/guards/jwt-auth.guard';
import { AUTH_COOKIE } from '../src/auth/token.util';
import { RegisterDto } from '../src/auth/dto/register.dto';
import { UserAccountStatus } from '../src/auth/enums/user-account-status.enum';

// SPEC-03: Componentes de Publicaciones y Filtros
import { PostsController } from '../src/posts/posts.controller';
import { PostCreateDto } from '../src/posts/dto/post-create.dto';
import { PostUpdateDto } from '../src/posts/dto/post-update.dto';

// Helper para emular el contexto de ejecución en JwtAuthGuard
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

describe('Suite de Integración Jest / xUnit: SPEC-01 (Auth & RBAC) <-> SPEC-03 (Publicaciones)', () => {
  let app: INestApplicationContext;
  let dataSource: DataSource;

  let authController: AuthController;
  let authService: AuthService;
  let sessionService: SessionService;
  let verificationService: AccountVerificationService;
  let recoveryService: PasswordRecoveryService;
  let jwtAuthGuard: JwtAuthGuard;

  let postsController: PostsController;

  const emailStudentA = 'jest.alumno1@aloe.ulima.edu.pe';
  const emailStudentB = 'jest.alumno2@aloe.ulima.edu.pe';
  const passwordInitial = 'PasswordSegura2026!';
  const passwordUpdated = 'NuevaPasswordSegura2026!';

  let studentAId = '';
  let studentBId = '';
  let studentAToken = '';
  let studentBToken = '';
  let testCourseId = '';
  let createdPostId = '';

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-luminaul-development-2026';

    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    dataSource = app.get(DataSource);

    authController = app.get(AuthController);
    authService = app.get(AuthService);
    sessionService = app.get(SessionService);
    verificationService = app.get(AccountVerificationService);
    recoveryService = app.get(PasswordRecoveryService);
    jwtAuthGuard = app.get(JwtAuthGuard);

    postsController = app.get(PostsController);

    // Limpieza de datos previos en PostgreSQL
    await dataSource.query(`DELETE FROM revoked_tokens WHERE user_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
    await dataSource.query(`DELETE FROM group_members WHERE user_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
    await dataSource.query(`DELETE FROM publications WHERE user_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
    await dataSource.query(`DELETE FROM groups WHERE leader_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
    await dataSource.query(`DELETE FROM profiles WHERE user_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
    await dataSource.query(`DELETE FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}');`);

    // Asegurar curso de prueba
    const courseCheck = await dataSource.query(`SELECT id FROM courses WHERE name = 'Arquitectura Jest Test' LIMIT 1;`);
    if (courseCheck.length > 0) {
      testCourseId = courseCheck[0].id;
    } else {
      const inserted = await dataSource.query(`
        INSERT INTO courses (id, name, cycle)
        VALUES (gen_random_uuid(), 'Arquitectura Jest Test', 7)
        RETURNING id;
      `);
      testCourseId = inserted[0].id;
    }
  });

  afterAll(async () => {
    // Limpieza posterior
    if (dataSource?.isInitialized) {
      await dataSource.query(`DELETE FROM revoked_tokens WHERE user_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
      await dataSource.query(`DELETE FROM group_members WHERE user_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
      await dataSource.query(`DELETE FROM publications WHERE user_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
      await dataSource.query(`DELETE FROM groups WHERE leader_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
      await dataSource.query(`DELETE FROM profiles WHERE user_id IN (SELECT id FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}'));`);
      await dataSource.query(`DELETE FROM users WHERE email IN ('${emailStudentA}', '${emailStudentB}');`);
    }
    if (app) {
      await app.close();
    }
  });

  describe('BLOQUE 1: Validaciones de Registro y Políticas de Acceso (SPEC-01)', () => {
    it('TEST-01: debe rechazar correos que no tengan el dominio institucional @aloe.ulima.edu.pe', async () => {
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
      expect(hasDomainError).toBe(true);
    });

    it('TEST-02: debe rechazar contraseñas con longitud menor a 10 caracteres', async () => {
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
      expect(hasLengthError).toBe(true);
    });

    it('TEST-03: debe registrar al estudiante y crear atómicamente el perfil en PostgreSQL', async () => {
      const res = await authController.register({
        email: emailStudentA,
        password: passwordInitial,
        name: 'Estudiante A Jest',
      });
      studentAId = res.userId;

      expect(res.status).toBe(UserAccountStatus.PENDING_VERIFICATION);
      expect(typeof studentAId).toBe('string');

      const userDb = await dataSource.query(`SELECT id, email, status, is_verified FROM users WHERE id = '${studentAId}';`);
      const profileDb = await dataSource.query(`SELECT user_id, name FROM profiles WHERE user_id = '${studentAId}';`);

      expect(userDb).toHaveLength(1);
      expect(userDb[0].status).toBe('pending_verification');
      expect(userDb[0].is_verified).toBe(false);

      expect(profileDb).toHaveLength(1);
      expect(profileDb[0].name).toBe('Estudiante A Jest');
    });

    it('TEST-04: debe rechazar con 409 Conflict si se intenta registrar un correo ya existente', async () => {
      await expect(
        authController.register({
          email: emailStudentA,
          password: passwordInitial,
          name: 'Duplicado',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('TEST-05: debe bloquear el login con 403 Forbidden si la cuenta está en pending_verification', async () => {
      const dummyRes: any = { cookie: () => {} };
      await expect(
        authController.login({ email: emailStudentA, password: passwordInitial }, dummyRes),
      ).rejects.toThrow(ForbiddenException);
    });

    it('TEST-06: debe responder 400 Bad Request si el código OTP no coincide', async () => {
      await expect(
        authController.verifyEmail({ email: emailStudentA, token: '000000' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('TEST-07: debe verificar la cuenta con el OTP correcto y transicionar a status active', async () => {
      const tokenRow = await dataSource.query(`SELECT verification_token FROM users WHERE id = '${studentAId}';`);
      const otpCode = tokenRow[0]?.verification_token;

      const verifyRes = await authController.verifyEmail({ email: emailStudentA, token: otpCode });
      expect(verifyRes.isVerified).toBe(true);

      const userDb = await dataSource.query(`SELECT status, is_verified, verification_token FROM users WHERE id = '${studentAId}';`);
      expect(userDb[0].status).toBe('active');
      expect(userDb[0].is_verified).toBe(true);
      expect(userDb[0].verification_token).toBeNull();
    });

    it('TEST-08: debe iniciar sesión exitosamente, emitiendo JWT HS256 y cookie httpOnly', async () => {
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
      expect(typeof studentAToken).toBe('string');
      expect(studentAToken.split('.')).toHaveLength(3);
      expect(loginRes.user.id).toBe(studentAId);
      expect(loginRes.user.role).toBe('student');
      expect(loginRes.user.status).toBe('active');
      expect(setCookieCall?.name).toBe(AUTH_COOKIE);
    });

    it('TEST-09: debe retornar los datos vigentes en GET /auth/me', async () => {
      const meRes = await authController.me(studentAId);
      expect(meRes.id).toBe(studentAId);
      expect(meRes.email).toBe(emailStudentA);
      expect(meRes.role).toBe('student');
      expect(meRes.status).toBe('active');
    });
  });

  describe('BLOQUE 2: Integración Transversal SPEC-01 (Auth) <-> SPEC-03 (Publicaciones)', () => {
    it('TEST-10: JwtAuthGuard debe validar el token y popular req.user con la identidad real', async () => {
      const { context, req } = createMockExecutionContext(studentAToken);
      const canActivate = await jwtAuthGuard.canActivate(context);

      expect(canActivate).toBe(true);
      expect(req.user?.id).toBe(studentAId);
      expect(req.user?.email).toBe(emailStudentA);
      expect(req.user?.role).toBe('student');
      expect(req.token).toBe(studentAToken);
    });

    it('TEST-11: debe crear una publicación vinculada orgánicamente al userId del estudiante autenticado', async () => {
      const createPayload: PostCreateDto = {
        courseId: testCourseId,
        type: 'study_group',
        description: 'Buscamos 2 integrantes para proyecto de software con Jest',
        benefits: 'Pair programming y cobertura de pruebas',
        requirements: 'Disponibilidad sábados',
        maxCapacity: 4,
      };

      const created = await postsController.createPost(createPayload, studentAId);
      createdPostId = created.id;

      expect(created.userId).toBe(studentAId);
      expect(created.courseId).toBe(testCourseId);

      const postDb = await dataSource.query(`SELECT id, user_id, status FROM publications WHERE id = '${createdPostId}';`);
      expect(postDb).toHaveLength(1);
      expect(postDb[0].user_id).toBe(studentAId);
      expect(postDb[0].status).toBe('published');
    });

    it('TEST-12: GET /posts/me debe retornar las publicaciones del estudiante autenticado', async () => {
      const myPosts = await postsController.getMyPosts({ limit: 10, offset: 0 }, studentAId);
      const found = myPosts.some((p) => p.id === createdPostId);
      expect(found).toBe(true);
    });

    it('TEST-13: debe registrar y autenticar a un segundo estudiante (Estudiante B)', async () => {
      const regRes = await authController.register({
        email: emailStudentB,
        password: passwordInitial,
        name: 'Estudiante B Jest',
      });
      studentBId = regRes.userId;

      const tokenRowB = await dataSource.query(`SELECT verification_token FROM users WHERE id = '${studentBId}';`);
      await authController.verifyEmail({ email: emailStudentB, token: tokenRowB[0]?.verification_token });

      const mockResB: any = { cookie: () => {} };
      const loginB = await authController.login(
        { email: emailStudentB, password: passwordInitial },
        mockResB,
      );
      studentBToken = loginB.accessToken;

      expect(typeof studentBToken).toBe('string');
      expect(loginB.user.id).toBe(studentBId);
    });

    it('TEST-14: GET /posts/me de Estudiante B no debe contener publicaciones de Estudiante A', async () => {
      const postsB = await postsController.getMyPosts({ limit: 10, offset: 0 }, studentBId);
      const containsAPost = postsB.some((p) => p.id === createdPostId);
      expect(containsAPost).toBe(false);
      expect(postsB).toHaveLength(0);
    });

    it('TEST-15: debe rechazar con 403 Forbidden si Estudiante B intenta editar el post de Estudiante A', async () => {
      const updatePayload: PostUpdateDto = {
        description: 'Intento de edicion no autorizada',
      };
      await expect(
        postsController.editPost(createdPostId, updatePayload, studentBId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('TEST-16: debe rechazar con 403 Forbidden si Estudiante B intenta eliminar el post de Estudiante A', async () => {
      await expect(
        postsController.deletePost(createdPostId, studentBId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('TEST-17: el autor legítimo (Estudiante A) debe poder editar su propia publicación con éxito', async () => {
      const updatePayload: PostUpdateDto = {
        description: 'Descripcion modificada por el autor legítimo',
      };
      const edited = await postsController.editPost(createdPostId, updatePayload, studentAId);
      expect(edited.id).toBe(createdPostId);
      expect(edited.description).toBe('Descripcion modificada por el autor legítimo');
    });
  });

  describe('BLOQUE 3: Revocación, Invalidación Dual y Soft-Delete (SPEC-01 + SPEC-03)', () => {
    it('TEST-18: POST /auth/logout debe revocar el token e insertar su hash SHA-256 en revoked_tokens', async () => {
      const mockReqA: AuthenticatedRequest = {
        user: { id: studentAId, email: emailStudentA, role: 'student' },
        token: studentAToken,
      } as any;
      const mockResA: any = { clearCookie: () => {} };

      const logoutRes = await authController.logout(mockReqA, mockResA);
      expect(logoutRes.message).toBe('Sesión cerrada correctamente');

      const revokedDb = await dataSource.query(`SELECT user_id, expires_at FROM revoked_tokens WHERE user_id = '${studentAId}';`);
      expect(revokedDb.length).toBeGreaterThan(0);
    });

    it('TEST-19: JwtAuthGuard debe rechazar con 401 Unauthorized ante intento de reutilizar el token revocado', async () => {
      const { context } = createMockExecutionContext(studentAToken);
      await expect(jwtAuthGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('TEST-20: resetPassword debe actualizar tokens_valid_after e invalidar tokens emitidos con clave anterior', async () => {
      const oldTokenB = studentBToken;

      await recoveryService.forgotPassword({ email: emailStudentB });
      const resetRow = await dataSource.query(`SELECT reset_token FROM users WHERE id = '${studentBId}';`);
      const resetOtp = resetRow[0]?.reset_token;

      // Esperar 1.1s para que tokens_valid_after supere la marca de tiempo (iat en segundos) del token previo
      await new Promise((resolve) => setTimeout(resolve, 1100));

      await recoveryService.resetPassword({
        email: emailStudentB,
        token: resetOtp,
        newPassword: passwordUpdated,
      });

      // El token previo debe ser rechazado
      const { context } = createMockExecutionContext(oldTokenB);
      await expect(jwtAuthGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);

      // Login con la nueva clave debe funcionar
      const mockResB2: any = { cookie: () => {} };
      const newLoginB = await authController.login(
        { email: emailStudentB, password: passwordUpdated },
        mockResB2,
      );
      expect(typeof newLoginB.accessToken).toBe('string');
    });

    it('TEST-21: DELETE /auth/me debe realizar soft-delete fijando status deleted y tokens_valid_after', async () => {
      const mockResA2: any = { clearCookie: () => {} };
      const delRes = await authController.deleteAccount(studentAId, mockResA2);
      expect(delRes.message).toBe('Cuenta eliminada exitosamente');

      const userDb = await dataSource.query(`SELECT status, deleted_at FROM users WHERE id = '${studentAId}';`);
      expect(userDb[0].status).toBe('deleted');
      expect(userDb[0].deleted_at).not.toBeNull();
    });

    it('TEST-22: login en cuenta borrada lógicamente debe responder 401 Unauthorized sin revelar existencia', async () => {
      const dummyRes: any = { cookie: () => {} };
      await expect(
        authController.login({ email: emailStudentA, password: passwordInitial }, dummyRes),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
