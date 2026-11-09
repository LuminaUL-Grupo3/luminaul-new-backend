import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth-security/guard/JwtAuthGuard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModerationService } from '../services/moderation.service';
import { CreateAppealDto, CreateReportDto } from '../dto/moderation-request.dto';
import {
  CreateAppealResponseDto,
  CreateReportResponseDto,
  ModerationLogDto,
  ReportDto,
} from '../dto/moderation-response.dto';

// Endpoints del alumno autenticado. La revisión de reportes y apelaciones la hace el
// administrador desde /admin (SPEC-07).
@ApiTags('Moderation')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Sin sesión válida' })
@UseGuards(JwtAuthGuard)
@Controller('moderation')
export class ModerationController {
  constructor(private readonly service: ModerationService) {}

  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reportar una publicación, mensaje o reseña (HU 6.1)' })
  @ApiResponse({ status: 201, type: CreateReportResponseDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'El contenido no existe' })
  @ApiResponse({ status: 409, description: 'Ya existe un reporte pendiente del mismo contenido' })
  createReport(
    @CurrentUser() userId: string,
    @Body() dto: CreateReportDto,
  ): Promise<CreateReportResponseDto> {
    return this.service.createReport(userId, dto);
  }

  @Get('reports/me')
  @ApiOperation({ summary: 'Reportes enviados por el alumno' })
  @ApiResponse({ status: 200, type: [ReportDto] })
  listMyReports(@CurrentUser() userId: string): Promise<ReportDto[]> {
    return this.service.listMyReports(userId);
  }

  @Get('my-logs')
  @ApiOperation({ summary: 'Historial de contenido propio moderado (HU 6.3)' })
  @ApiResponse({ status: 200, type: [ModerationLogDto] })
  listMyLogs(@CurrentUser() userId: string): Promise<ModerationLogDto[]> {
    return this.service.listMyLogs(userId);
  }

  @Post('appeals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apelar una moderación automática (HU 6.4)' })
  @ApiResponse({ status: 201, type: CreateAppealResponseDto })
  @ApiResponse({ status: 403, description: 'La moderación pertenece a otro alumno' })
  @ApiResponse({ status: 404, description: 'La moderación no existe' })
  @ApiResponse({ status: 409, description: 'Ya existe una apelación para esta moderación' })
  createAppeal(
    @CurrentUser() userId: string,
    @Body() dto: CreateAppealDto,
  ): Promise<CreateAppealResponseDto> {
    return this.service.createAppeal(userId, dto);
  }
}
