import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { HttpStatus, INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX, configureHttpApp } from '../../../config/http-app.config';
import { AdminController } from '../controller/AdminController';
import { AdminService } from '../service/AdminService';
import { AdminServiceImpl } from '../service/impl/AdminServiceImpl';
import {
  AdminRepository,
  AppealRecord,
  AppealRow,
  ChangeUserStatusCommand,
  ContentRecord,
  Page,
  ReportRecord,
  ReportRow,
  StatsRow,
  UserModerationStatsRow,
  UserRecord,
  UserRow,
} from '../repository/AdminRepository';
import { NotificationClient } from '../client/NotificationClient';
import { ChatClient } from '../client/ChatClient';
import { NotificationSendEvent } from '../events/notification-send.event';
import { buildStatusStrategies } from '../strategy/UserStatusChangeStrategy';
import { SuspendUserStrategy } from '../strategy/impl/SuspendUserStrategy';
import { ReactivateUserStrategy } from '../strategy/impl/ReactivateUserStrategy';
import { ADMIN_MESSAGES, NOTICES, USER_STATUS_STRATEGIES } from '../administration.constants';
import { SessionService, ValidatedSession } from '../../auth-security/service/SessionService';
import { UserEntity } from '../../auth-security/entities/user.entity';
import { AuthException } from '../../auth-security/exception/AuthException';
import { AUTH_MESSAGES } from '../../auth-security/auth.constants';
import { UserAccountStatus } from '../../auth-security/enums/UserAccountStatus';
import { UserRole } from '../../auth-security/enums/UserRole';

// Prueba de caja negra de "Suspender cuenta" (HU 7.1): PATCH /api/admin/users/:userId/status.
//
// Se diseña solo a partir de la especificación pública del endpoint, sin mirar su código:
//   - Entradas: userId (ruta), status y reason (cuerpo) y el token del que llama (cabecera).
//       userId  UUID de la cuenta a cambiar.
//       status  'suspended' (suspender) o 'active' (reactivar).
//       reason  motivo obligatorio, de 1 a 300 caracteres (se recortan los espacios).
//       token   sesión de un administrador.
//   - 200 { message, userId, status } si la cuenta cambia de estado.
//   - 400 si la petición está mal formada o el administrador intenta cambiar su propia cuenta.
//   - 401 sin sesión válida y 403 si quien llama no es administrador o la cuenta es de otro
//     administrador.
//   - 404 si la cuenta no existe o fue eliminada; 409 si ya está en ese estado o aún no se
//     verificó.
//   - El resultado se observa también en el listado público GET /api/admin/users.
//
// La API se levanta con configureHttpApp (mismo prefijo, ValidationPipe y filtro de errores que
// main.ts) y se usa solo por HTTP. El controller, el service y las estrategias son los reales.
// La base de datos se reemplaza por un repositorio en memoria: como el service depende de la
// abstracción AdminRepository (DAO), basta con darle otra implementación. La sesión también se
// reemplaza: cada token de prueba corresponde a una cuenta fija.
//
// Técnicas: particiones de equivalencia (EV = válida, EI = inválida), valores límite (BV) y
// tabla de decisión del estado y rol de la cuenta (TD).

const ADMIN_ID = '99887766-5544-4322-8100-aabbccddeeff';
const OTHER_ADMIN_ID = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d';
const STUDENT_CALLER_ID = 'a1b2c3d4-e5f6-47a8-b9c0-123456789abc';
const ADMIN_TOKEN = 'token-admin';
const STUDENT_TOKEN = 'token-alumno';
const REASON = 'Lenguaje ofensivo o insultos. Insultó a otro alumno en el chat del grupo';
const MAX_REASON = 300;

// Base de datos en memoria con el mismo contrato que AdminRepositoryImpl (solo la tabla users)
class InMemoryAdminRepository extends AdminRepository {
  private readonly rows = new Map<string, UserRow>();

  add(data: { id?: string; name: string; role: UserRole; status: UserAccountStatus }): string {
    const id = data.id ?? randomUUID();
    this.rows.set(id, {
      id,
      email: `${id.slice(0, 8)}@aloe.ulima.edu.pe`,
      name: data.name,
      role: data.role,
      status: data.status,
      is_verified: data.status !== UserAccountStatus.PENDING_VERIFICATION,
      suspension_reason: data.status === UserAccountStatus.SUSPENDED ? 'Suspensión anterior' : null,
      created_at: new Date(),
    });
    return id;
  }

  clear(): void {
    this.rows.clear();
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const row = this.rows.get(id);
    return row
      ? { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status }
      : null;
  }

  async findUsers(
    search: string | null,
    status: string | null,
    limit: number,
    offset: number,
  ): Promise<Page<UserRow>> {
    const rows = [...this.rows.values()].filter(
      (row) => (!search || row.name.includes(search)) && (!status || row.status === status),
    );
    return { total: rows.length, rows: rows.slice(offset, offset + limit) };
  }

  // Igual que el UPDATE real: solo cambia cuentas activas o suspendidas que no estén ya en ese estado
  async changeUserStatus(command: ChangeUserStatusCommand): Promise<boolean> {
    const row = this.rows.get(command.userId);
    if (!row || row.status === command.status || !['active', 'suspended'].includes(row.status)) {
      return false;
    }
    row.status = command.status;
    row.suspension_reason = command.status === 'suspended' ? command.reason : null;
    return true;
  }

  // El resto del contrato no lo usa la HU 7.1
  async findReportById(): Promise<ReportRecord | null> {
    throw new Error('No se usa en la HU 7.1');
  }
  async findReports(): Promise<Page<ReportRow>> {
    throw new Error('No se usa en la HU 7.1');
  }
  async findContent(): Promise<ContentRecord | null> {
    throw new Error('No se usa en la HU 7.1');
  }
  async resolveReport(): Promise<boolean> {
    throw new Error('No se usa en la HU 7.1');
  }
  async findAppealById(): Promise<AppealRecord | null> {
    throw new Error('No se usa en la HU 7.1');
  }
  async findAppeals(): Promise<Page<AppealRow>> {
    throw new Error('No se usa en la HU 7.1');
  }
  async resolveAppeal(): Promise<boolean> {
    throw new Error('No se usa en la HU 7.1');
  }
  async getStats(): Promise<StatsRow> {
    throw new Error('No se usa en la HU 7.1');
  }
  async getUserModerationStats(): Promise<UserModerationStatsRow> {
    throw new Error('No se usa en la HU 7.1');
  }
}

// Sesiones de prueba: cada token corresponde a una cuenta fija (administrador o alumno)
class StubSessionService extends SessionService {
  get ttlSeconds(): number {
    return 3600;
  }

  issueAccessToken(): string {
    return ADMIN_TOKEN;
  }

  async validate(token: string): Promise<ValidatedSession> {
    const accounts: Record<string, { id: string; role: UserRole }> = {
      [ADMIN_TOKEN]: { id: ADMIN_ID, role: UserRole.ADMIN },
      [STUDENT_TOKEN]: { id: STUDENT_CALLER_ID, role: UserRole.STUDENT },
    };
    const account = accounts[token];
    if (!account) {
      throw new AuthException(AUTH_MESSAGES.INVALID_TOKEN, HttpStatus.UNAUTHORIZED);
    }
    const user = Object.assign(new UserEntity(), {
      id: account.id,
      email: `${account.id.slice(0, 8)}@aloe.ulima.edu.pe`,
      role: account.role,
    });
    return {
      payload: { sub: account.id, email: user.email, role: account.role, exp: 0 },
      user,
    };
  }

  async revoke(): Promise<void> {
    return;
  }
}

// Bandeja de avisos: guarda las notificaciones que la API manda a los alumnos
class RecordingNotificationClient extends NotificationClient {
  readonly sent: NotificationSendEvent[] = [];

  notify(notice: NotificationSendEvent): void {
    this.sent.push(notice);
  }
}

// La HU 7.1 no avisa al chat
class UnusedChatClient extends ChatClient {
  contentVisibilityChanged(): void {
    throw new Error('No se usa en la HU 7.1');
  }
}

const repository = new InMemoryAdminRepository();
const notifications = new RecordingNotificationClient();

@Module({
  controllers: [AdminController],
  providers: [
    { provide: AdminRepository, useValue: repository },
    { provide: NotificationClient, useValue: notifications },
    { provide: ChatClient, useClass: UnusedChatClient },
    { provide: SessionService, useClass: StubSessionService },
    SuspendUserStrategy,
    ReactivateUserStrategy,
    {
      provide: USER_STATUS_STRATEGIES,
      useFactory: buildStatusStrategies,
      inject: [SuspendUserStrategy, ReactivateUserStrategy],
    },
    { provide: AdminService, useClass: AdminServiceImpl },
  ],
})
class ChangeUserStatusTestModule {}

interface ApiResponse {
  status: number;
  body: { statusCode?: number; message?: string | string[]; userId?: string; status?: string };
}

describe('Suspender cuenta · PATCH /api/admin/users/:userId/status (caja negra)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(ChangeUserStatusTestModule, { logger: false });
    configureHttpApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/${API_PREFIX}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    repository.clear();
    notifications.sent.length = 0;
    repository.add({ id: ADMIN_ID, name: 'Administrador', role: UserRole.ADMIN, status: UserAccountStatus.ACTIVE });
  });

  async function changeStatus(
    userId: string,
    body: unknown,
    token: string | null = ADMIN_TOKEN,
  ): Promise<ApiResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token !== null) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`${baseUrl}/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  // Estado y motivo de la cuenta según el listado público del panel
  async function listedAccount(userId: string): Promise<{ status: string; suspensionReason: string | null }> {
    const res = await fetch(`${baseUrl}/admin/users`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const body = (await res.json()) as {
      items: { id: string; status: string; suspensionReason: string | null }[];
    };
    const account = body.items.find((item) => item.id === userId);
    if (!account) throw new Error(`La cuenta ${userId} no aparece en el listado`);
    return { status: account.status, suspensionReason: account.suspensionReason };
  }

  // Precondición: una cuenta de alumno en el estado indicado
  function student(status: UserAccountStatus): string {
    return repository.add({ name: 'Martín Vizcarra', role: UserRole.STUDENT, status });
  }

  function expectSuspended(res: ApiResponse, userId: string): void {
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: ADMIN_MESSAGES.USER_SUSPENDED,
      userId,
      status: 'suspended',
    });
  }

  function expectRejected(res: ApiResponse, status: number, message: string): void {
    expect(res.status).toBe(status);
    expect(res.body.statusCode).toBe(status);
    expect(res.body.message).toEqual(message);
  }

  // Comprueba que la cuenta siguió igual después de una petición rechazada
  async function expectUnchanged(userId: string, status: UserAccountStatus): Promise<void> {
    expect((await listedAccount(userId)).status).toBe(status);
  }

  describe('Particiones de equivalencia del campo userId', () => {
    it('EV1 · UUID de un alumno activo: la cuenta queda suspendida', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      const res = await changeStatus(id, { status: 'suspended', reason: REASON });

      expectSuspended(res, id);
      expect(await listedAccount(id)).toEqual({ status: 'suspended', suspensionReason: REASON });
    });

    it('EI1 · texto que no es un UUID: 400', async () => {
      const res = await changeStatus('abc', { status: 'suspended', reason: REASON });

      expectRejected(res, 400, 'Validation failed (uuid is expected)');
    });

    it('EI2 · UUID con formato válido que no pertenece a ninguna cuenta: 404', async () => {
      const res = await changeStatus(randomUUID(), { status: 'suspended', reason: REASON });

      expectRejected(res, 404, ADMIN_MESSAGES.USER_NOT_FOUND);
    });
  });

  describe('Particiones de equivalencia del campo status', () => {
    it('EV2 · "active" sobre una cuenta suspendida: la reactiva', async () => {
      const id = student(UserAccountStatus.SUSPENDED);

      const res = await changeStatus(id, { status: 'active', reason: 'Apelación aceptada' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: ADMIN_MESSAGES.USER_ACTIVATED, userId: id, status: 'active' });
    });

    it('EI3 · "deleted", "SUSPENDED" (mayúsculas) o campo ausente: 400 en las 3 ejecuciones', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      for (const body of [
        { status: 'deleted', reason: REASON },
        { status: 'SUSPENDED', reason: REASON },
        { reason: REASON },
      ]) {
        const res = await changeStatus(id, body);
        expect(res.status).toBe(400);
        expect(res.body.message).toEqual(['El estado debe ser active o suspended']);
      }
      await expectUnchanged(id, UserAccountStatus.ACTIVE);
    });
  });

  describe('Particiones de equivalencia y valores límite del campo reason', () => {
    it('BV1 · motivo de 1 carácter (longitud mínima): se acepta', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      expectSuspended(await changeStatus(id, { status: 'suspended', reason: 'X' }), id);
    });

    it('BV2 · motivo de 300 caracteres (longitud máxima): se acepta completo', async () => {
      const id = student(UserAccountStatus.ACTIVE);
      const reason = 'a'.repeat(MAX_REASON);

      expectSuspended(await changeStatus(id, { status: 'suspended', reason }), id);
      expect((await listedAccount(id)).suspensionReason).toHaveLength(MAX_REASON);
    });

    it('BV3 · motivo de 301 caracteres (máximo + 1): 400', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      const res = await changeStatus(id, { status: 'suspended', reason: 'a'.repeat(MAX_REASON + 1) });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(['El motivo no puede superar los 300 caracteres']);
      await expectUnchanged(id, UserAccountStatus.ACTIVE);
    });

    it('EV3 · motivo con espacios alrededor: se recorta y se guarda sin ellos', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      expectSuspended(await changeStatus(id, { status: 'suspended', reason: `   ${REASON}   ` }), id);
      expect((await listedAccount(id)).suspensionReason).toBe(REASON);
    });

    it('EI4 · motivo vacío, solo espacios, ausente o nulo: 400 "Debes indicar el motivo" en las 4 ejecuciones', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      for (const body of [
        { status: 'suspended', reason: '' },
        { status: 'suspended', reason: '     ' },
        { status: 'suspended' },
        { status: 'suspended', reason: null },
      ]) {
        const res = await changeStatus(id, body);
        expect(res.status).toBe(400);
        expect(res.body.message).toEqual(['Debes indicar el motivo']);
      }
      await expectUnchanged(id, UserAccountStatus.ACTIVE);
    });

    it('EI5 · motivo que no es texto (número, booleano, lista u objeto): 400 en las 4 ejecuciones', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      for (const reason of [123, true, ['Spam'], { motivo: 'Spam' }]) {
        const res = await changeStatus(id, { status: 'suspended', reason });
        expect(res.status).toBe(400);
        expect(res.body.message).toEqual(expect.arrayContaining(['El motivo debe ser un texto']));
      }
      await expectUnchanged(id, UserAccountStatus.ACTIVE);
    });
  });

  describe('Particiones de equivalencia de la sesión de quien llama', () => {
    it('EI6 · sin token: 401', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      const res = await changeStatus(id, { status: 'suspended', reason: REASON }, null);

      expectRejected(res, 401, AUTH_MESSAGES.MISSING_TOKEN);
      await expectUnchanged(id, UserAccountStatus.ACTIVE);
    });

    it('EI7 · token inválido: 401', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      const res = await changeStatus(id, { status: 'suspended', reason: REASON }, 'token-falso');

      expectRejected(res, 401, AUTH_MESSAGES.INVALID_TOKEN);
    });

    it('EI8 · sesión de un alumno (no administrador): 403', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      const res = await changeStatus(id, { status: 'suspended', reason: REASON }, STUDENT_TOKEN);

      expectRejected(res, 403, AUTH_MESSAGES.FORBIDDEN_ROLE);
      await expectUnchanged(id, UserAccountStatus.ACTIVE);
    });
  });

  describe('Tabla de decisión: estado y rol de la cuenta × estado pedido', () => {
    it('R1 · alumno activo + suspended: 200 y la cuenta queda suspendida con el motivo', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      expectSuspended(await changeStatus(id, { status: 'suspended', reason: REASON }), id);
      expect(await listedAccount(id)).toEqual({ status: 'suspended', suspensionReason: REASON });
      // Al suspender no se envía aviso: el alumno ya no puede entrar a verlo
      expect(notifications.sent).toHaveLength(0);
    });

    it('R2 · alumno suspendido + active: 200, se borra el motivo y se avisa al alumno', async () => {
      const id = student(UserAccountStatus.SUSPENDED);

      const res = await changeStatus(id, { status: 'active', reason: 'Apelación aceptada' });

      expect(res.status).toBe(200);
      expect(await listedAccount(id)).toEqual({ status: 'active', suspensionReason: null });
      expect(notifications.sent).toEqual([
        expect.objectContaining({ userId: id, title: NOTICES.ACCOUNT_REACTIVATED.title }),
      ]);
    });

    it('R3 · alumno suspendido + suspended: 409', async () => {
      const id = student(UserAccountStatus.SUSPENDED);

      const res = await changeStatus(id, { status: 'suspended', reason: REASON });

      expectRejected(res, 409, ADMIN_MESSAGES.USER_ALREADY_SUSPENDED);
    });

    it('R4 · alumno activo + active: 409', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      const res = await changeStatus(id, { status: 'active', reason: 'Reactivar' });

      expectRejected(res, 409, ADMIN_MESSAGES.USER_ALREADY_ACTIVE);
    });

    it('R5 · cuenta pendiente de verificación: 409 y sigue pendiente', async () => {
      const id = student(UserAccountStatus.PENDING_VERIFICATION);

      const res = await changeStatus(id, { status: 'suspended', reason: REASON });

      expectRejected(res, 409, ADMIN_MESSAGES.USER_NOT_VERIFIED);
      await expectUnchanged(id, UserAccountStatus.PENDING_VERIFICATION);
    });

    it('R6 · cuenta eliminada: 404', async () => {
      const id = student(UserAccountStatus.DELETED);

      const res = await changeStatus(id, { status: 'suspended', reason: REASON });

      expectRejected(res, 404, ADMIN_MESSAGES.USER_NOT_FOUND);
    });

    it('R7 · cuenta de otro administrador: 403 y sigue activa', async () => {
      repository.add({
        id: OTHER_ADMIN_ID,
        name: 'Otro administrador',
        role: UserRole.ADMIN,
        status: UserAccountStatus.ACTIVE,
      });

      const res = await changeStatus(OTHER_ADMIN_ID, { status: 'suspended', reason: REASON });

      expectRejected(res, 403, ADMIN_MESSAGES.CANNOT_SUSPEND_ADMIN);
      await expectUnchanged(OTHER_ADMIN_ID, UserAccountStatus.ACTIVE);
    });

    it('R8 · la propia cuenta del administrador: 400', async () => {
      const res = await changeStatus(ADMIN_ID, { status: 'suspended', reason: REASON });

      expectRejected(res, 400, ADMIN_MESSAGES.CANNOT_CHANGE_OWN_STATUS);
      await expectUnchanged(ADMIN_ID, UserAccountStatus.ACTIVE);
    });

    it('Ciclo completo: suspender y luego reactivar la misma cuenta', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      expectSuspended(await changeStatus(id, { status: 'suspended', reason: REASON }), id);
      const res = await changeStatus(id, { status: 'active', reason: 'Apelación aceptada' });

      expect(res.status).toBe(200);
      expect(await listedAccount(id)).toEqual({ status: 'active', suspensionReason: null });
    });
  });

  describe('Forma de la petición', () => {
    it('EI9 · un campo adicional no previsto: 400', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      const res = await changeStatus(id, { status: 'suspended', reason: REASON, role: 'admin' });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(['property role should not exist']);
      await expectUnchanged(id, UserAccountStatus.ACTIVE);
    });

    it('EI10 · cuerpo vacío: 400 con los errores de ambos campos', async () => {
      const id = student(UserAccountStatus.ACTIVE);

      const res = await changeStatus(id, {});

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining(['El estado debe ser active o suspended', 'Debes indicar el motivo']),
      );
    });
  });
});
