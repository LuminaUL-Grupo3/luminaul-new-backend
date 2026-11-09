import { Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth-security/guard/JwtAuthGuard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { NotificationsService } from '../services/notifications.service';
import { MarkNotificationReadResponseDto, NotificationDto } from '../dto/admin-response.dto';

// Disponible para cualquier alumno autenticado (no requiere rol admin)
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Mis notificaciones, de la más reciente a la más antigua (SPEC-07)' })
  @ApiResponse({ status: 200, type: [NotificationDto] })
  listMine(@CurrentUser() userId: string): Promise<NotificationDto[]> {
    return this.service.listMine(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar una notificación propia como leída (SPEC-07)' })
  @ApiResponse({ status: 200, type: MarkNotificationReadResponseDto })
  @ApiResponse({ status: 404, description: 'La notificación no existe o no es del usuario' })
  markRead(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MarkNotificationReadResponseDto> {
    return this.service.markRead(userId, id);
  }
}
