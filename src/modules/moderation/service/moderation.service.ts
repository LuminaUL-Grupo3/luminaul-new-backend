import { CreateAppealDto, CreateReportDto } from '../dto/moderation-request.dto';
import {
  CreateAppealResponseDto,
  CreateReportResponseDto,
  ModerationLogDto,
  ReportDto,
} from '../dto/moderation-response.dto';

// Casos de uso del alumno en SPEC-06. El controller depende de esta abstracción y
// ModerationModule elige la implementación (D de SOLID), igual que ReviewsService (SPEC-05).
export abstract class ModerationService {
  // HU 6.1: reportar una publicación, mensaje o reseña
  abstract createReport(userId: string, dto: CreateReportDto): Promise<CreateReportResponseDto>;

  // Reportes enviados por el alumno (GET /moderation/reports/me)
  abstract listMyReports(userId: string): Promise<ReportDto[]>;

  // HU 6.3: historial de contenido propio moderado
  abstract listMyLogs(userId: string): Promise<ModerationLogDto[]>;

  // HU 6.4: apelar una moderación automática propia
  abstract createAppeal(userId: string, dto: CreateAppealDto): Promise<CreateAppealResponseDto>;
}
