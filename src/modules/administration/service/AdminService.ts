import {
  AppealsQueryDto,
  ChangeUserStatusDto,
  ReportsQueryDto,
  ResolveAppealDto,
  ResolveReportDto,
  UsersQueryDto,
} from '../dto/admin-request.dto';
import {
  AdminAppealListResponseDto,
  AdminReportListResponseDto,
  AdminStatsDto,
  AdminUserListResponseDto,
  ChangeUserStatusResponseDto,
  ResolveAppealResponseDto,
  ResolveReportResponseDto,
} from '../dto/admin-response.dto';

/**
 * Casos de uso del panel de administración (SPEC-07, HU 7.1–7.5).
 *
 * AdminController depende de esta abstracción y no de la implementación: principio de
 * Inversión de Dependencias (DIP). AdministrationModule decide qué clase la implementa
 * ({ provide: AdminService, useClass: AdminServiceImpl }).
 */
export abstract class AdminService {
  // HU 7.4: historial de reportes
  abstract listReports(query: ReportsQueryDto): Promise<AdminReportListResponseDto>;

  // HU 7.2: resolver o desestimar un reporte (y eliminar el contenido si corresponde)
  abstract resolveReport(
    adminId: string,
    reportId: string,
    dto: ResolveReportDto,
  ): Promise<ResolveReportResponseDto>;

  // HU 7.5: historial de apelaciones
  abstract listAppeals(query: AppealsQueryDto): Promise<AdminAppealListResponseDto>;

  // HU 7.3: aprobar o rechazar una apelación
  abstract resolveAppeal(
    adminId: string,
    appealId: string,
    dto: ResolveAppealDto,
  ): Promise<ResolveAppealResponseDto>;

  // HU 7.1: listado de cuentas
  abstract listUsers(query: UsersQueryDto): Promise<AdminUserListResponseDto>;

  // HU 7.1: suspender o reactivar una cuenta
  abstract changeUserStatus(
    adminId: string,
    userId: string,
    dto: ChangeUserStatusDto,
  ): Promise<ChangeUserStatusResponseDto>;

  // Métricas del panel
  abstract getStats(): Promise<AdminStatsDto>;
}
