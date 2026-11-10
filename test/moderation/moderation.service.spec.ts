import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { type Mocked } from 'vitest';
import { ModerationService } from '../../src/modules/moderation/service/moderation.service';
import { ModerationServiceImpl } from '../../src/modules/moderation/service/impl/moderation.service.impl';
import { ModerationRepository } from '../../src/modules/moderation/repository/moderation.repository';
import { ContentReportEntity } from '../../src/modules/moderation/entities/content-report.entity';
import { ContentModerationLogEntity } from '../../src/modules/moderation/entities/content-moderation-log.entity';
import { ContentAppealEntity } from '../../src/modules/moderation/entities/content-appeal.entity';
import {
  TargetContentType,
  ReportStatus,
  AppealStatus,
  ModerationResult,
  ModerationDecision,
} from '../../src/modules/moderation/enums/moderation.enums';

describe('ModerationService (Unit)', () => {
  let service: ModerationService;
  let mockRepo: Mocked<ModerationRepository>;

  const reporterId = 'user-uuid-reporter';
  const authorId = 'user-uuid-author';
  const publicationId = 'pub-uuid-1';
  const logId = 'log-uuid-1';

  beforeEach(() => {
    mockRepo = {
      listBannedWords: vi.fn(),
      findContent: vi.fn(),
      canAccessGroup: vi.fn(),
      findPendingReport: vi.fn(),
      createReport: vi.fn(),
      findReportsByReporter: vi.fn(),
      findLog: vi.fn(),
      findLatestAppeal: vi.fn(),
      createAppeal: vi.fn(),
      findLogsByAuthor: vi.fn(),
    } as unknown as Mocked<ModerationRepository>;

    service = new ModerationServiceImpl(mockRepo);
  });

  // HU 6.1 · createReport. Complejidad ciclomática V(G) = 9 (8 decisiones + 1), así que hay
  // 9 caminos independientes. Cada prueba recorre uno (C1..C9, ver informe cap. 10.2).
  describe('createReport (HU 6.1)', () => {
    const messageId = 'msg-uuid-1';
    const groupId = 'group-uuid-1';
    const publicationDto = {
      targetType: TargetContentType.PUBLICATION,
      targetId: publicationId,
      reason: 'Spam o contenido comercial',
    };
    const publishedPost = { authorId, groupId: null, status: 'published' };
    const savedReport = {
      id: 'report-uuid-1',
      reporterId,
      targetType: TargetContentType.PUBLICATION,
      targetId: publicationId,
      reason: 'Spam o contenido comercial',
      status: ReportStatus.PENDING,
      createdAt: new Date(),
    } as ContentReportEntity;

    it('C1: rechaza con 404 un tipo de contenido no soportado sin consultar la base', async () => {
      await expect(
        service.createReport(reporterId, {
          ...publicationDto,
          targetType: 'comment' as TargetContentType,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.findContent).not.toHaveBeenCalled();
    });

    it('C2: rechaza con 404 si el contenido no existe o fue eliminado', async () => {
      mockRepo.findContent.mockResolvedValue(null);

      await expect(service.createReport(reporterId, publicationDto)).rejects.toThrow(
        'El contenido que intentas reportar no existe o fue eliminado',
      );
      expect(mockRepo.createReport).not.toHaveBeenCalled();
    });

    it('C3: rechaza con 404 un mensaje de un grupo al que el alumno no pertenece', async () => {
      mockRepo.findContent.mockResolvedValue({ authorId, groupId, status: 'published' });
      mockRepo.canAccessGroup.mockResolvedValue(false);

      await expect(
        service.createReport(reporterId, {
          targetType: TargetContentType.MESSAGE,
          targetId: messageId,
          reason: 'Acoso o intimidación',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.canAccessGroup).toHaveBeenCalledWith(groupId, reporterId);
      expect(mockRepo.findPendingReport).not.toHaveBeenCalled();
    });

    it('C4: registra el reporte de un mensaje cuando el alumno es miembro del grupo', async () => {
      mockRepo.findContent.mockResolvedValue({ authorId, groupId, status: 'published' });
      mockRepo.canAccessGroup.mockResolvedValue(true);
      mockRepo.findPendingReport.mockResolvedValue(null);
      mockRepo.createReport.mockResolvedValue({
        ...savedReport,
        targetType: TargetContentType.MESSAGE,
        targetId: messageId,
      } as ContentReportEntity);

      const result = await service.createReport(reporterId, {
        targetType: TargetContentType.MESSAGE,
        targetId: messageId,
        reason: 'Acoso o intimidación',
      });

      expect(result.status).toBe(ReportStatus.PENDING);
      expect(mockRepo.createReport).toHaveBeenCalledWith(
        reporterId,
        TargetContentType.MESSAGE,
        messageId,
        'Acoso o intimidación',
      );
    });

    it('C5: rechaza con 400 que el alumno reporte su propio contenido', async () => {
      mockRepo.findContent.mockResolvedValue({ ...publishedPost, authorId: reporterId });

      await expect(service.createReport(reporterId, publicationDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRepo.findPendingReport).not.toHaveBeenCalled();
    });

    it('C6: rechaza con 409 si ya tiene un reporte pendiente del mismo contenido', async () => {
      mockRepo.findContent.mockResolvedValue(publishedPost);
      mockRepo.findPendingReport.mockResolvedValue(savedReport);

      await expect(service.createReport(reporterId, publicationDto)).rejects.toThrow(
        'Ya reportaste este contenido anteriormente',
      );
      expect(mockRepo.createReport).not.toHaveBeenCalled();
    });

    it('C7: registra el reporte de una publicación y responde con el mensaje de éxito', async () => {
      mockRepo.findContent.mockResolvedValue(publishedPost);
      mockRepo.findPendingReport.mockResolvedValue(null);
      mockRepo.createReport.mockResolvedValue(savedReport);

      const result = await service.createReport(reporterId, publicationDto);

      expect(result).toEqual({
        message: 'Tu reporte fue enviado con éxito. El equipo de administración revisará el caso.',
        reportId: 'report-uuid-1',
        status: ReportStatus.PENDING,
      });
      expect(mockRepo.canAccessGroup).not.toHaveBeenCalled();
    });

    it('C8: responde 409 si dos envíos simultáneos chocan con el índice único uq_reporter_target', async () => {
      mockRepo.findContent.mockResolvedValue(publishedPost);
      mockRepo.findPendingReport.mockResolvedValue(null);
      mockRepo.createReport.mockRejectedValue({ driverError: { code: '23505' } });

      await expect(service.createReport(reporterId, publicationDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('C9: propaga cualquier otro error de la base de datos sin convertirlo', async () => {
      mockRepo.findContent.mockResolvedValue(publishedPost);
      mockRepo.findPendingReport.mockResolvedValue(null);
      const dbError = new Error('connection terminated');
      mockRepo.createReport.mockRejectedValue(dbError);

      await expect(service.createReport(reporterId, publicationDto)).rejects.toBe(dbError);
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
        moderationDecision: ModerationDecision.HIDDEN,
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

    it('debe lanzar BadRequestException si el contenido fue aprobado y no sancionado', async () => {
      const approvedLog: Partial<ContentModerationLogEntity> = {
        id: logId,
        authorId,
        contentType: TargetContentType.PUBLICATION,
        contentId: publicationId,
        result: ModerationResult.APPROVED,
        moderationDecision: ModerationDecision.APPROVED,
      };
      mockRepo.findLog.mockResolvedValue(approvedLog as ContentModerationLogEntity);

      await expect(
        service.createAppeal(authorId, {
          moderationLogId: logId,
          justification: 'Apelar algo aprobado',
        }),
      ).rejects.toThrow(BadRequestException);
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
        result: ModerationResult.BLOCKED,
        moderationDecision: ModerationDecision.HIDDEN,
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
        result: ModerationResult.BLOCKED,
        moderationDecision: ModerationDecision.HIDDEN,
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

