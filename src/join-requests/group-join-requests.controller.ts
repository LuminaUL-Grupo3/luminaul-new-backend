import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JoinRequestsService } from './join-requests.service';
import { CreateJoinRequestDto } from './dto/create-join-request.dto';
import { CreateJoinRequestResponseDto } from './dto/create-join-request-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * H.U 2.1 — Enviar solicitud de unión a un grupo de estudio.
 *
 * Vive en el módulo join-requests (y no en groups) porque el recurso que se crea
 * es una solicitud: así la lógica queda junto a la de la H.U 2.2 y se evita la
 * dependencia circular GroupsModule <-> JoinRequestsModule.
 *
 * Capa de presentación: solo recibe la petición, extrae los datos y delega en el Service.
 */
@ApiTags('Join Requests')
@Controller('groups/:group_id/join-requests')
@UseGuards(JwtAuthGuard)
export class GroupJoinRequestsController {
  constructor(private readonly joinRequestsService: JoinRequestsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enviar solicitud de unión a un grupo de estudio (H.U 2.1)',
    description:
      'Registra una solicitud en estado "pending" del usuario actual hacia el grupo indicado.',
  })
  @ApiParam({
    name: 'group_id',
    type: 'string',
    format: 'uuid',
    description: 'ID del grupo de estudio',
  })
  @ApiResponse({
    status: 201,
    description: 'Solicitud enviada con éxito',
    type: CreateJoinRequestResponseDto,
  })
  @ApiResponse({ status: 400, description: 'UUID inválido o mensaje vacío / demasiado largo' })
  @ApiResponse({ status: 404, description: 'Grupo no encontrado o eliminado' })
  @ApiResponse({
    status: 409,
    description: 'Ya perteneces a este grupo o ya tienes una solicitud pendiente para este grupo',
  })
  async createRequest(
    @Param('group_id', ParseUUIDPipe) groupId: string,
    @Body() payload: CreateJoinRequestDto,
    @CurrentUser() userId: string,
  ): Promise<CreateJoinRequestResponseDto> {
    return this.joinRequestsService.createRequest(groupId, userId, payload.message);
  }
}
