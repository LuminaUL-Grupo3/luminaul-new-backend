import { BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AdminService } from '../services/admin.service';
import { AdminRepository, UserRow, AppealRecord } from '../repositories/admin.repository';
import { ManagedUserStatus, AppealStatus, ContentType } from '../enums/administration.enums';

describe('AdminService (Unit)', () => {
  let service: AdminService;
  let mockRepo: jest.Mocked<AdminRepository>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;

  const adminId = 'user-uuid-admin';
  const targetUserId = 'user-uuid-student';
  const appealId = 'appeal-uuid-1';

  beforeEach(() => {
    mockRepo = {
      findReports: jest.fn(),
      findReportById: jest.fn(),
      resolveReport: jest.fn(),
      findAppeals: jest.fn(),
      findAppealById: jest.fn(),
      resolveAppeal: jest.fn(),
      findUsers: jest.fn(),
      findUserById: jest.fn(),
      changeUserStatus: jest.fn(),
      getStats: jest.fn(),
      findContent: jest.fn(),
    } as unknown as jest.Mocked<AdminRepository>;

    mockEventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    service = new AdminService(mockRepo, mockEventEmitter);
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
      ).rejects.toThrow(BadRequestException);
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
      ).rejects.toThrow(ForbiddenException);
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
      ).rejects.toThrow(ConflictException);
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
      ).rejects.toThrow(NotFoundException);
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
      ).rejects.toThrow(ConflictException);
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
