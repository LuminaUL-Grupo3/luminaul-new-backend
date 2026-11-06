import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ModerationService } from '../../src/modules/moderation/services/moderation.service';
import { ModerationRepository } from '../../src/modules/moderation/repositories/moderation.repository';
import { ContentReportEntity } from '../../src/modules/moderation/entities/content-report.entity';
import { ContentModerationLogEntity } from '../../src/modules/moderation/entities/content-moderation-log.entity';
import { ContentAppealEntity } from '../../src/modules/moderation/entities/content-appeal.entity';
import { TargetContentType, ReportStatus, AppealStatus, ModerationResult } from '../../src/modules/moderation/enums/moderation.enums';

describe('ModerationService (Unit)', () => {
  let service: ModerationService;
  let mockRepo: jest.Mocked<ModerationRepository>;

  const reporterId = 'user-uuid-reporter';
  const authorId = 'user-uuid-author';
  const publicationId = 'pub-uuid-1';
  const logId = 'log-uuid-1';

  beforeEach(() => {
    mockRepo = {
      listBannedWords: jest.fn(),
      findContent: jest.fn(),
      canAccessGroup: jest.fn(),
      findPendingReport: jest.fn(),
      createReport: jest.fn(),
      findReportsByReporter: jest.fn(),
      findLog: jest.fn(),
      findLatestAppeal: jest.fn(),
      createAppeal: jest.fn(),
      findLogsByAuthor: jest.fn(),
    } as unknown as jest.Mocked<ModerationRepository>;

    service = new ModerationService(mockRepo);
  });

  describe('createReport', () => {
    it('debe registrar un reporte exitosamente (Happy Path)', async () => {
      mockRepo.findContent.mockResolvedValue({
        authorId,
        groupId: null,
        status: 'published',
      });
      mockRepo.findPendingReport.mockResolvedValue(null);

      const fakeReport: Partial<ContentReportEntity> = {
        id: 'report-uuid-1',
        reporterId,
        targetType: TargetContentType.PUBLICATION,
        targetId: publicationId,
        reason: 'Spam o contenido comercial',
        status: ReportStatus.PENDING,
        createdAt: new Date(),
      };
      mockRepo.createReport.mockResolvedValue(fakeReport as ContentReportEntity);

      const result = await service.createReport(reporterId, {
        targetType: TargetContentType.PUBLICATION,
        targetId: publicationId,
        reason: 'Spam o contenido comercial',
      });

      expect(result.reportId).toBe('report-uuid-1');
      expect(result.status).toBe(ReportStatus.PENDING);
      expect(mockRepo.createReport).toHaveBeenCalled();
    });

    it('debe lanzar NotFoundException si el recurso reportado no existe', async () => {
      mockRepo.findContent.mockResolvedValue(null);

      await expect(
        service.createReport(reporterId, {
          targetType: TargetContentType.PUBLICATION,
          targetId: 'invalido',
          reason: 'Cualquiera',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar ConflictException si el usuario ya tiene un reporte pendiente sobre el mismo recurso', async () => {
      mockRepo.findContent.mockResolvedValue({
        authorId,
        groupId: null,
        status: 'published',
      });
      mockRepo.findPendingReport.mockResolvedValue({} as ContentReportEntity);

      await expect(
        service.createReport(reporterId, {
          targetType: TargetContentType.PUBLICATION,
          targetId: publicationId,
          reason: 'Reporte repetido',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('createAppeal', () => {
    it('debe crear apelación cuando el autor apela contenido bloqueado (Happy Path)', async () => {
      const fakeLog: Partial<ContentModerationLogEntity> = {
        id: logId,
        authorId,
        contentType: TargetContentType.PUBLICATION,
        contentId: publicationId,
        result: ModerationResult.BLOCKED,
      };
      mockRepo.findLog.mockResolvedValue(fakeLog as ContentModerationLogEntity);
      mockRepo.findLatestAppeal.mockResolvedValue(null);

      const fakeAppeal: Partial<ContentAppealEntity> = {
        id: 'appeal-uuid-1',
        moderationLogId: logId,
        userId: authorId,
        justification: 'Uso en contexto académico',
        status: AppealStatus.PENDING,
      };
      mockRepo.createAppeal.mockResolvedValue(fakeAppeal as ContentAppealEntity);

      const result = await service.createAppeal(authorId, {
        moderationLogId: logId,
        justification: 'Uso en contexto académico',
      });

      expect(result.appealId).toBe('appeal-uuid-1');
      expect(result.status).toBe(AppealStatus.PENDING);
    });

    it('debe lanzar NotFoundException si el log de moderación no existe', async () => {
      mockRepo.findLog.mockResolvedValue(null);

      await expect(
        service.createAppeal(authorId, {
          moderationLogId: 'inexistente',
          justification: 'Texto',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar ForbiddenException (BOLA / IDOR) si un usuario ajeno intenta apelar', async () => {
      const fakeLog: Partial<ContentModerationLogEntity> = {
        id: logId,
        authorId,
      };
      mockRepo.findLog.mockResolvedValue(fakeLog as ContentModerationLogEntity);

      await expect(
        service.createAppeal('otro-usuario-ajeno', {
          moderationLogId: logId,
          justification: 'Texto',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe lanzar ConflictException si ya existe una apelación activa para el mismo log', async () => {
      const fakeLog: Partial<ContentModerationLogEntity> = {
        id: logId,
        authorId,
      };
      mockRepo.findLog.mockResolvedValue(fakeLog as ContentModerationLogEntity);
      mockRepo.findLatestAppeal.mockResolvedValue({
        status: AppealStatus.PENDING,
      } as ContentAppealEntity);

      await expect(
        service.createAppeal(authorId, {
          moderationLogId: logId,
          justification: 'Segunda apelacion',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});

