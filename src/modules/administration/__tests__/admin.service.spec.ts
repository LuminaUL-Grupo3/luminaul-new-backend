import { EventEmitter2 } from '@nestjs/event-emitter';
import { type Mocked } from 'vitest';
import { AdminServiceImpl } from '../service/impl/AdminServiceImpl';
import { NotificationClientImpl } from '../client/impl/NotificationClientImpl';
import { ChatClientImpl } from '../client/impl/ChatClientImpl';
import { SuspendUserStrategy } from '../strategy/impl/SuspendUserStrategy';
import { ReactivateUserStrategy } from '../strategy/impl/ReactivateUserStrategy';
import { AdminRepository, UserRow, AppealRecord } from '../repository/AdminRepository';
import { ManagedUserStatus, AppealStatus, ContentType } from '../enums/administration.enums';

describe('AdminServiceImpl (Unit)', () => {
  let service: AdminServiceImpl;
  let mockRepo: Mocked<AdminRepository>;
  let mockEventEmitter: Mocked<EventEmitter2>;

  const adminId = 'user-uuid-admin';
  const targetUserId = 'user-uuid-student';
  const appealId = 'appeal-uuid-1';

  beforeEach(() => {
    mockRepo = {
      findReports: vi.fn(),
      findReportById: vi.fn(),
      resolveReport: vi.fn(),
      findAppeals: vi.fn(),
      findAppealById: vi.fn(),
      resolveAppeal: vi.fn(),
      findUsers: vi.fn(),
      findUserById: vi.fn(),
      changeUserStatus: vi.fn(),
      getStats: vi.fn(),
      findContent: vi.fn(),
    } as unknown as Mocked<AdminRepository>;

    mockEventEmitter = {
      emit: vi.fn(),
    } as unknown as Mocked<EventEmitter2>;

    const notificationClient = new NotificationClientImpl(mockEventEmitter);
    service = new AdminServiceImpl(mockRepo, notificationClient, new ChatClientImpl(mockEventEmitter), {
      [ManagedUserStatus.SUSPENDED]: new SuspendUserStrategy(mockRepo),
      [ManagedUserStatus.ACTIVE]: new ReactivateUserStrategy(mockRepo, notificationClient),
    });
  });

  describe('changeUserStatus', () => {
    it('debe suspender a un estudiante exitosamente (Happy Path)', async () => {
      const studentUser: Partial<UserRow> = {
        id: targetUserId,
        email: 'alumno@aloe.ulima.edu.pe',
        name: 'Alumno Prueba',
        role: 'student',
        status: 'active',
        is_verified: true,
      };
      mockRepo.findUserById.mockResolvedValue(studentUser as UserRow);
      mockRepo.changeUserStatus.mockResolvedValue(true);

      const result = await service.changeUserStatus(adminId, targetUserId, {
        status: ManagedUserStatus.SUSPENDED,
        reason: 'Infracción de normas comunitarias',
      });

      expect(result.userId).toBe(targetUserId);
      expect(result.status).toBe(ManagedUserStatus.SUSPENDED);
      expect(mockRepo.changeUserStatus).toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException si el administrador intenta auto-suspenderse', async () => {
      await expect(
        service.changeUserStatus(adminId, adminId, {
          status: ManagedUserStatus.SUSPENDED,
          reason: 'Auto suspensión',
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('debe lanzar ForbiddenException si se intenta suspender a otro administrador', async () => {
      const anotherAdmin: Partial<UserRow> = {
        id: 'other-admin-id',
        role: 'admin',
        status: 'active',
      };
      mockRepo.findUserById.mockResolvedValue(anotherAdmin as UserRow);

      await expect(
        service.changeUserStatus(adminId, 'other-admin-id', {
          status: ManagedUserStatus.SUSPENDED,
          reason: 'Intento',
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('debe lanzar ConflictException si el usuario ya tiene el estado solicitado', async () => {
      const suspendedUser: Partial<UserRow> = {
        id: targetUserId,
        role: 'student',
        status: 'suspended',
      };
      mockRepo.findUserById.mockResolvedValue(suspendedUser as UserRow);

      await expect(
        service.changeUserStatus(adminId, targetUserId, {
          status: ManagedUserStatus.SUSPENDED,
          reason: 'Ya suspendido',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('resolveAppeal', () => {
    it('debe aprobar apelación, restaurar visibilidad y emitir eventos (Happy Path)', async () => {
      const pendingAppeal: Partial<AppealRecord> = {
        id: appealId,
        status: AppealStatus.PENDING,
        contentType: ContentType.PUBLICATION,
        contentId: 'pub-123',
        userId: targetUserId,
      };
      mockRepo.findAppealById.mockResolvedValue(pendingAppeal as AppealRecord);
      mockRepo.resolveAppeal.mockResolvedValue(true);

      const result = await service.resolveAppeal(adminId, appealId, {
        status: AppealStatus.APPROVED,
      });

      expect(result.appealId).toBe(appealId);
      expect(result.status).toBe(AppealStatus.APPROVED);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'content.visibility_changed',
        expect.objectContaining({ contentType: ContentType.PUBLICATION, contentId: 'pub-123' }),
      );
    });

    it('debe lanzar NotFoundException si la apelación no existe', async () => {
      mockRepo.findAppealById.mockResolvedValue(null);

      await expect(
        service.resolveAppeal(adminId, 'invalida', { status: AppealStatus.APPROVED }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('debe lanzar ConflictException si la apelación ya fue resuelta anteriormente', async () => {
      const resolvedAppeal: Partial<AppealRecord> = {
        id: appealId,
        status: AppealStatus.APPROVED,
        contentType: ContentType.PUBLICATION,
        contentId: 'pub-123',
        userId: targetUserId,
      };
      mockRepo.findAppealById.mockResolvedValue(resolvedAppeal as AppealRecord);

      await expect(
        service.resolveAppeal(adminId, appealId, { status: AppealStatus.APPROVED }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('getStats', () => {
    it('debe retornar métricas consolidadas formateadas como números', async () => {
      mockRepo.getStats.mockResolvedValue({
        total_users: '45',
        total_active_groups: '12',
        total_posts: '30',
        pending_reports: '4',
        pending_appeals: '2',
      });

      const stats = await service.getStats();

      expect(stats.totalUsers).toBe(45);
      expect(stats.totalActiveGroups).toBe(12);
      expect(stats.totalPosts).toBe(30);
      expect(stats.pendingReports).toBe(4);
      expect(stats.pendingAppeals).toBe(2);
    });
  });
});
