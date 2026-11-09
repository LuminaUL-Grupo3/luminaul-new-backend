import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth-security/guard/JwtAuthGuard';
import { RolesGuard } from '../../auth-security/guard/RolesGuard';
import { Roles } from '../../auth-security/decorator/Roles';
import { UserRole } from '../../auth-security/enums/UserRole';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AdminService } from '../service/AdminService';
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

// Controller del panel de administración: solo recibe la petición, valida su formato (DTO)
// y delega en AdminService (SRP). No tiene reglas de negocio.
// RBAC: JwtAuthGuard autentica (401) y RolesGuard exige el rol de plataforma 'admin' (403)
@ApiTags('Administration')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Sin sesión válida' })
@ApiResponse({ status: 403, description: 'El usuario no es administrador' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('reports')
  @ApiOperation({ summary: 'Historial de reportes (HU 7.4 / SPEC-07)' })
  @ApiResponse({ status: 200, type: AdminReportListResponseDto })
  listReports(@Query() query: ReportsQueryDto): Promise<AdminReportListResponseDto> {
    return this.service.listReports(query);
  }

  @Patch('reports/:reportId')
  @ApiOperation({ summary: 'Resolver o desestimar un reporte; eliminar el contenido (HU 7.2)' })
  @ApiResponse({ status: 200, type: ResolveReportResponseDto })
  @ApiResponse({ status: 404, description: 'Reporte o contenido inexistente' })
  @ApiResponse({ status: 409, description: 'El reporte ya fue resuelto' })
  resolveReport(
    @CurrentUser() adminId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: ResolveReportDto,
  ): Promise<ResolveReportResponseDto> {
    return this.service.resolveReport(adminId, reportId, dto);
  }

  @Get('appeals')
  @ApiOperation({ summary: 'Historial de apelaciones (HU 7.5 / SPEC-07)' })
  @ApiResponse({ status: 200, type: AdminAppealListResponseDto })
  listAppeals(@Query() query: AppealsQueryDto): Promise<AdminAppealListResponseDto> {
    return this.service.listAppeals(query);
  }

  @Patch('appeals/:appealId')
  @ApiOperation({ summary: 'Aprobar o rechazar una apelación (HU 7.3)' })
  @ApiResponse({ status: 200, type: ResolveAppealResponseDto })
  @ApiResponse({ status: 404, description: 'Apelación inexistente' })
  @ApiResponse({ status: 409, description: 'La apelación ya fue resuelta' })
  resolveAppeal(
    @CurrentUser() adminId: string,
    @Param('appealId', ParseUUIDPipe) appealId: string,
    @Body() dto: ResolveAppealDto,
  ): Promise<ResolveAppealResponseDto> {
    return this.service.resolveAppeal(adminId, appealId, dto);
  }

  @Get('users')
  @ApiOperation({ summary: 'Listado de cuentas de la plataforma (HU 7.1)' })
  @ApiResponse({ status: 200, type: AdminUserListResponseDto })
  listUsers(@Query() query: UsersQueryDto): Promise<AdminUserListResponseDto> {
    return this.service.listUsers(query);
  }

  @Patch('users/:userId/status')
  @ApiOperation({ summary: 'Suspender o reactivar una cuenta (HU 7.1)' })
  @ApiResponse({ status: 200, type: ChangeUserStatusResponseDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos o cuenta propia' })
  @ApiResponse({ status: 404, description: 'Usuario inexistente' })
  @ApiResponse({ status: 409, description: 'La cuenta ya está en ese estado o no está verificada' })
  changeUserStatus(
    @CurrentUser() adminId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ChangeUserStatusDto,
  ): Promise<ChangeUserStatusResponseDto> {
    return this.service.changeUserStatus(adminId, userId, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Métricas generales del panel (SPEC-07)' })
  @ApiResponse({ status: 200, type: AdminStatsDto })
  getStats(): Promise<AdminStatsDto> {
    return this.service.getStats();
  }
}
