import 'reflect-metadata';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { JwtAuthGuard } from '../src/modules/auth-security/guards/jwt-auth.guard';
import { RolesGuard } from '../src/modules/auth-security/guards/roles.guard';
import { ROLES_KEY } from '../src/modules/auth-security/decorators/roles.decorator';
import { UserRole } from '../src/modules/auth-security/enums/user-role.enum';
import { AdminController } from '../src/modules/administration/controllers/admin.controller';
import { NotificationsController } from '../src/modules/administration/controllers/notifications.controller';
import {
  ChangeUserStatusDto,
  ResolveAppealDto,
  ResolveReportDto,
} from '../src/modules/administration/dto/admin-request.dto';
import { AdminRepository } from '../src/modules/administration/repositories/admin.repository';
import { NotificationsRepository } from '../src/modules/administration/repositories/notifications.repository';
import { AdminService } from '../src/modules/administration/services/admin.service';
import { NotificationsService } from '../src/modules/administration/services/notifications.service';
import { NotificationsListener } from '../src/modules/administration/listeners/notifications.listener';
import { CONTENT_TARGETS } from '../src/modules/administration/policies/content-targets';
import {
  AppealStatus,
  ContentType,
  ManagedUserStatus,
  NotificationType,
  ReportAction,
  ReportStatus,
} from '../src/modules/administration/enums/administration.enums';
import { NOTIFICATION_SEND_EVENT } from '../src/modules/administration/administration.constants';

const ADMIN = '99887766-5544-4322-8100-aabbccddeeff';
const STUDENT = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const REPORT = 'd5a19022-77aa-4899-b1c2-349801289fed';
const APPEAL = 'f7b32144-99cc-4011-b3e4-561023401bcd';
const POST = '18938a12-6f2b-4d43-9801-bca908234fed';

const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();

function buildRepository() {
  return {
    findReportById: asyncMock().mockResolvedValue({
      id: REPORT,
      status: 'pending',
      targetType: 'publication',
      targetId: POST,
    }),
    findContent: asyncMock().mockResolvedValue({ id: POST, authorId: STUDENT, status: 'published' }),
    resolveReport: asyncMock().mockResolvedValue(true),
    findReports: asyncMock().mockResolvedValue({ total: 0, rows: [] }),
    findAppealById: asyncMock().mockResolvedValue({
      id: APPEAL,
      status: 'pending',
      userId: STUDENT,
      contentType: 'publication',
      contentId: POST,
    }),
    resolveAppeal: asyncMock().mockResolvedValue(true),
    findAppeals: asyncMock().mockResolvedValue({ total: 0, rows: [] }),
    findUserById: asyncMock().mockResolvedValue({
      id: STUDENT,
      email: '20210001@aloe.ulima.edu.pe',
      name: 'Martín Vizcarra',
      role: 'student',
      status: 'active',
    }),
    findUsers: asyncMock().mockResolvedValue({ total: 0, rows: [] }),
    changeUserStatus: asyncMock().mockResolvedValue(true),
    getStats: asyncMock().mockResolvedValue({
      total_users: '7',
      total_active_groups: '1',
      total_posts: '1',
      pending_reports: '1',
      pending_appeals: '1',
    }),
  };
}

const errorsOf = async <T extends object>(type: new () => T, body: object) =>
  (await validate(plainToInstance(type, body))).map((error) => error.property);

describe('SPEC-07: Panel de Administración y Notificaciones', () => {
  let repository: ReturnType<typeof buildRepository>;
  let events: { emit: jest.Mock };
  let service: AdminService;

  beforeEach(() => {
    repository = buildRepository();
    events = { emit: jest.fn() };
    service = new AdminService(
      repository as unknown as AdminRepository,
      events as unknown as EventEmitter2,
    );
  });

  describe('Seguridad (RBAC)', () => {
    it('las rutas /admin exigen sesión y rol admin', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, AdminController);
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
      expect(Reflect.getMetadata(ROLES_KEY, AdminController)).toEqual([UserRole.ADMIN]);
    });

    it('las rutas /notifications exigen sesión pero no rol admin', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, NotificationsController)).toEqual([JwtAuthGuard]);
      expect(Reflect.getMetadata(ROLES_KEY, NotificationsController)).toBeUndefined();
    });
  });

  describe('DTOs', () => {
    it('ChangeUserStatusDto acepta un cambio válido', async () => {
      expect(await errorsOf(ChangeUserStatusDto, { status: 'suspended', reason: 'Spam' })).toEqual([]);
    });

    it.each([
      ['estado desconocido', { status: 'deleted', reason: 'x' }, 'status'],
      ['motivo vacío', { status: 'suspended', reason: '   ' }, 'reason'],
      ['sin motivo', { status: 'suspended' }, 'reason'],
      ['motivo de más de 500 caracteres', { status: 'suspended', reason: 'a'.repeat(501) }, 'reason'],
    ])('ChangeUserStatusDto rechaza %s', async (_name, body, property) => {
      expect(await errorsOf(ChangeUserStatusDto, body)).toContain(property);
    });

    it('ResolveReportDto rechaza estados y acciones fuera del contrato', async () => {
      expect(await errorsOf(ResolveReportDto, { status: 'pending' })).toContain('status');
      expect(await errorsOf(ResolveReportDto, { status: 'resolved', action: 'ban' })).toContain('action');
    });

    it('ResolveAppealDto solo acepta approved o rejected', async () => {
      expect(await errorsOf(ResolveAppealDto, { status: 'approved' })).toEqual([]);
      expect(await errorsOf(ResolveAppealDto, { status: 'pending' })).toContain('status');
    });
  });

  // Caja blanca: un caso por cada camino de AdminService.resolveReport
  describe('resolveReport (HU 7.2)', () => {
    const deletePost = { status: ReportStatus.RESOLVED, action: ReportAction.DELETE_CONTENT } as ResolveReportDto;

    it('404 si el reporte no existe', async () => {
      repository.findReportById.mockResolvedValue(null);
      await expect(service.resolveReport(ADMIN, REPORT, deletePost)).rejects.toThrow(NotFoundException);
    });

    it('409 si el reporte ya fue resuelto', async () => {
      repository.findReportById.mockResolvedValue({ id: REPORT, status: 'resolved', targetType: 'publication', targetId: POST });
      await expect(service.resolveReport(ADMIN, REPORT, deletePost)).rejects.toThrow(ConflictException);
    });

    it('400 si se pide eliminar el contenido al desestimar', async () => {
      const dto = { status: ReportStatus.DISMISSED, action: ReportAction.DELETE_CONTENT } as ResolveReportDto;
      await expect(service.resolveReport(ADMIN, REPORT, dto)).rejects.toThrow(BadRequestException);
    });

    it('422 si el tipo de contenido no está soportado', async () => {
      repository.findReportById.mockResolvedValue({ id: REPORT, status: 'pending', targetType: 'group', targetId: POST });
      await expect(service.resolveReport(ADMIN, REPORT, deletePost)).rejects.toThrow(UnprocessableEntityException);
    });

    it('404 si el contenido a eliminar ya no existe', async () => {
      repository.findContent.mockResolvedValue(null);
      await expect(service.resolveReport(ADMIN, REPORT, deletePost)).rejects.toThrow(NotFoundException);
      expect(repository.resolveReport).not.toHaveBeenCalled();
    });

    it('409 si otro administrador lo resolvió en paralelo', async () => {
      repository.resolveReport.mockResolvedValue(false);
      await expect(service.resolveReport(ADMIN, REPORT, deletePost)).rejects.toThrow(ConflictException);
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('elimina el post, notifica al autor y responde "Post eliminado con éxito"', async () => {
      const result = await service.resolveReport(ADMIN, REPORT, deletePost);

      expect(result).toEqual({ message: 'Post eliminado con éxito', reportId: REPORT, status: 'resolved' });
      expect(repository.resolveReport).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: ADMIN,
          contentToDelete: { target: CONTENT_TARGETS[ContentType.PUBLICATION], id: POST },
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        NOTIFICATION_SEND_EVENT,
        expect.objectContaining({ userId: STUDENT, type: NotificationType.MODERATION }),
      );
    });

    it('desestima sin tocar el contenido ni notificar', async () => {
      const result = await service.resolveReport(ADMIN, REPORT, { status: ReportStatus.DISMISSED } as ResolveReportDto);

      expect(result.message).toBe('Reporte desestimado con éxito');
      expect(repository.findContent).not.toHaveBeenCalled();
      expect(repository.resolveReport).toHaveBeenCalledWith(expect.objectContaining({ contentToDelete: null }));
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('resolveAppeal (HU 7.3)', () => {
    it('404 si la apelación no existe', async () => {
      repository.findAppealById.mockResolvedValue(null);
      await expect(
        service.resolveAppeal(ADMIN, APPEAL, { status: AppealStatus.APPROVED } as ResolveAppealDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('409 si la apelación ya fue resuelta', async () => {
      repository.findAppealById.mockResolvedValue({ id: APPEAL, status: 'rejected', userId: STUDENT, contentType: 'publication', contentId: POST });
      await expect(
        service.resolveAppeal(ADMIN, APPEAL, { status: AppealStatus.APPROVED } as ResolveAppealDto),
      ).rejects.toThrow(ConflictException);
    });

    it('aprobar restaura el contenido y notifica: "Apelación aprobada con éxito"', async () => {
      const result = await service.resolveAppeal(ADMIN, APPEAL, { status: AppealStatus.APPROVED } as ResolveAppealDto);

      expect(result.message).toBe('Apelación aprobada con éxito');
      expect(repository.resolveAppeal).toHaveBeenCalledWith(
        expect.objectContaining({ contentToRestore: { target: CONTENT_TARGETS[ContentType.PUBLICATION], id: POST } }),
      );
      expect(events.emit).toHaveBeenCalledWith(NOTIFICATION_SEND_EVENT, expect.objectContaining({ userId: STUDENT }));
    });

    it('rechazar no restaura nada: "Apelación rechazada con éxito"', async () => {
      const result = await service.resolveAppeal(ADMIN, APPEAL, { status: AppealStatus.REJECTED } as ResolveAppealDto);

      expect(result.message).toBe('Apelación rechazada con éxito');
      expect(repository.resolveAppeal).toHaveBeenCalledWith(expect.objectContaining({ contentToRestore: null }));
    });
  });

  describe('changeUserStatus (HU 7.1)', () => {
    const suspend = { status: ManagedUserStatus.SUSPENDED, reason: 'Lenguaje ofensivo' } as ChangeUserStatusDto;
    const activate = { status: ManagedUserStatus.ACTIVE, reason: 'Apelación aceptada' } as ChangeUserStatusDto;

    it('400 si el administrador intenta cambiar su propia cuenta', async () => {
      await expect(service.changeUserStatus(ADMIN, ADMIN, suspend)).rejects.toThrow(BadRequestException);
    });

    it.each([
      ['no existe', null],
      ['está eliminado', { id: STUDENT, email: 'x', name: 'x', role: 'student', status: 'deleted' }],
    ])('404 si el usuario %s', async (_name, user) => {
      repository.findUserById.mockResolvedValue(user);
      await expect(service.changeUserStatus(ADMIN, STUDENT, suspend)).rejects.toThrow(NotFoundException);
    });

    it('403 si el objetivo es otro administrador', async () => {
      repository.findUserById.mockResolvedValue({ id: STUDENT, email: 'x', name: 'x', role: 'admin', status: 'active' });
      await expect(service.changeUserStatus(ADMIN, STUDENT, suspend)).rejects.toThrow(ForbiddenException);
    });

    it('409 si la cuenta no está verificada', async () => {
      repository.findUserById.mockResolvedValue({ id: STUDENT, email: 'x', name: 'x', role: 'student', status: 'pending_verification' });
      await expect(service.changeUserStatus(ADMIN, STUDENT, activate)).rejects.toThrow(ConflictException);
    });

    it('409 si ya está suspendida', async () => {
      repository.findUserById.mockResolvedValue({ id: STUDENT, email: 'x', name: 'x', role: 'student', status: 'suspended' });
      await expect(service.changeUserStatus(ADMIN, STUDENT, suspend)).rejects.toThrow('El usuario ya se encuentra suspendido');
    });

    it('suspende, audita y no notifica (el suspendido no puede entrar)', async () => {
      const result = await service.changeUserStatus(ADMIN, STUDENT, suspend);

      expect(result).toEqual({
        message: 'Estado de usuario actualizado a suspendido. Sesiones activas revocadas.',
        userId: STUDENT,
        status: 'suspended',
      });
      expect(repository.changeUserStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'suspended', reason: 'Lenguaje ofensivo', adminId: ADMIN }),
      );
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('reactivar notifica al alumno', async () => {
      repository.findUserById.mockResolvedValue({ id: STUDENT, email: 'x', name: 'x', role: 'student', status: 'suspended' });
      const result = await service.changeUserStatus(ADMIN, STUDENT, activate);

      expect(result.status).toBe('active');
      expect(events.emit).toHaveBeenCalledWith(
        NOTIFICATION_SEND_EVENT,
        expect.objectContaining({ userId: STUDENT, type: NotificationType.SYSTEM }),
      );
    });
  });

  describe('Listados y métricas (HU 7.4 / 7.5)', () => {
    it('mapea el reporte con su autor y contenido', async () => {
      repository.findReports.mockResolvedValue({
        total: 1,
        rows: [
          {
            id: REPORT,
            reason: 'Spam',
            status: 'pending',
            created_at: new Date('2026-10-29T14:00:00.000Z'),
            resolved_at: null,
            resolution_notes: null,
            target_type: 'publication',
            target_id: POST,
            reporter_id: ADMIN,
            reporter_email: 'admin@aloe.ulima.edu.pe',
            reporter_name: 'Admin',
            content: 'Buscamos 2 personas',
            current_status: 'published',
            author_id: STUDENT,
            author_name: 'Martín Vizcarra',
            author_status: 'active',
          },
        ],
      });

      const result = await service.listReports({ limit: 20, offset: 0 });

      expect(result.total).toBe(1);
      expect(result.items[0].createdAt).toBe('2026-10-29T14:00:00.000Z');
      expect(result.items[0].target).toEqual(
        expect.objectContaining({ authorName: 'Martín Vizcarra', content: 'Buscamos 2 personas' }),
      );
    });

    it('lista vacía devuelve total 0 (la UI muestra "No hay contenido reportado")', async () => {
      expect(await service.listReports({ limit: 20, offset: 0 })).toEqual({ total: 0, items: [] });
    });

    it('convierte las métricas de texto a número', async () => {
      expect(await service.getStats()).toEqual({
        totalUsers: 7,
        totalActiveGroups: 1,
        totalPosts: 1,
        pendingReports: 1,
        pendingAppeals: 1,
      });
    });
  });

  describe('Notificaciones', () => {
    const notification = {
      id: 'n1',
      userId: STUDENT,
      title: 'Bienvenido',
      message: 'Hola',
      type: NotificationType.SYSTEM,
      isRead: false,
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
    };
    let notificationsRepo: Record<string, ReturnType<typeof asyncMock>>;
    let notifications: NotificationsService;

    beforeEach(() => {
      notificationsRepo = {
        create: asyncMock().mockResolvedValue(notification),
        findByUser: asyncMock().mockResolvedValue([notification]),
        findOwn: asyncMock().mockResolvedValue(notification),
        markRead: asyncMock().mockResolvedValue(undefined),
      };
      notifications = new NotificationsService(notificationsRepo as unknown as NotificationsRepository);
    });

    it('lista las notificaciones propias en formato del contrato', async () => {
      const [item] = await notifications.listMine(STUDENT);
      expect(item).toEqual(expect.objectContaining({ id: 'n1', isRead: false, createdAt: '2026-11-01T10:00:00.000Z' }));
    });

    it('404 al marcar una notificación ajena o inexistente', async () => {
      notificationsRepo.findOwn.mockResolvedValue(null);
      await expect(notifications.markRead(STUDENT, 'n1')).rejects.toThrow(NotFoundException);
    });

    it('marca como leída solo si no lo estaba', async () => {
      await notifications.markRead(STUDENT, 'n1');
      expect(notificationsRepo.markRead).toHaveBeenCalledWith('n1');

      notificationsRepo.findOwn.mockResolvedValue({ ...notification, isRead: true });
      notificationsRepo.markRead.mockClear();
      await notifications.markRead(STUDENT, 'n1');
      expect(notificationsRepo.markRead).not.toHaveBeenCalled();
    });

    it('el listener no propaga errores al módulo que emitió el evento', async () => {
      notificationsRepo.create.mockRejectedValue(new Error('BD caída'));
      const listener = new NotificationsListener(notifications);
      await expect(
        listener.handle({ userId: STUDENT, title: 't', message: 'm', type: NotificationType.GROUP }),
      ).resolves.toBeUndefined();
    });
  });
});
