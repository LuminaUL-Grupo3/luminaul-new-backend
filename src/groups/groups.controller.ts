import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { GroupDetailResponseDto } from './dto/group-detail-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Groups')
@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @ApiOperation({ summary: 'Mis grupos de estudio' })
  list(@CurrentUser() id: string) {
    return this.groupsService.listMyGroups(id);
  }

  // H.U 2.1 — Detalle del grupo y estado del usuario frente a él
  @Get(':group_id')
  @ApiOperation({
    summary: 'Detalle de un grupo de estudio (H.U 2.1)',
    description:
      'Retorna la información del grupo y my_status (admin | member | pending | none) para que el frontend decida si muestra "Enviar solicitud".',
  })
  @ApiParam({ name: 'group_id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: GroupDetailResponseDto })
  @ApiResponse({ status: 400, description: 'UUID inválido' })
  @ApiResponse({ status: 404, description: 'Grupo no encontrado o eliminado' })
  async getGroupDetail(
    @Param('group_id', ParseUUIDPipe) groupId: string,
    @CurrentUser() userId: string,
  ): Promise<GroupDetailResponseDto> {
    return this.groupsService.getGroupDetail(groupId, userId);
  }
}
