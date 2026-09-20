import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JoinRequestsService } from './join-requests.service';
import { RespondJoinRequestDto } from './dto/respond-join-request.dto';
import {
  JoinRequestRespondResponseDto,
} from './dto/join-request-response.dto';
import { JoinRequestListResponseDto } from './dto/join-request-list-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Join Requests')
@Controller('join-requests')
export class JoinRequestsController {
  constructor(private readonly joinRequestsService: JoinRequestsService) {}

  // H.U 2.2 — Listar solicitudes pendientes (Criterios #3 y #4)
  @Get('me')
  @ApiOperation({
    summary: 'Listar solicitudes pendientes de todos mis grupos (H.U 2.2)',
    description:
      'Retorna todas las solicitudes en estado pendiente de los grupos administrados por el alumno actual. Si no hay solicitudes, retorna una lista vacía con el mensaje "No hay solicitudes pendientes por revisar".',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de solicitudes pendientes o estado vacío',
    type: JoinRequestListResponseDto,
  })
  async listMyRequests(
    @CurrentUser() userId: string,
  ): Promise<JoinRequestListResponseDto> {
    return this.joinRequestsService.listMyRequests(userId);
  }

  // H.U 2.2 — Aceptar o rechazar solicitud (Criterios #1 y #2)
  @Patch(':request_id')
  @ApiOperation({
    summary: 'Aceptar o rechazar una solicitud de unión al grupo (H.U 2.2)',
    description:
      'Permite al administrador del grupo aceptar o rechazar una solicitud de unión pendiente.',
  })
  @ApiParam({
    name: 'request_id',
    type: 'string',
    format: 'uuid',
    description: 'ID de la solicitud de unión',
  })
  @ApiResponse({
    status: 200,
    description: 'Solicitud procesada exitosamente',
    type: JoinRequestRespondResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros de entrada inválidos o formato UUID incorrecto',
  })
  @ApiResponse({
    status: 403,
    description: 'No tienes permisos para gestionar solicitudes de este grupo',
  })
  @ApiResponse({
    status: 404,
    description: 'Solicitud o grupo no encontrado',
  })
  @ApiResponse({
    status: 409,
    description: 'La solicitud ya ha sido procesada anteriormente',
  })
  async respondToRequest(
    @Param('request_id', ParseUUIDPipe) requestId: string,
    @Body() payload: RespondJoinRequestDto,
    @CurrentUser() userId: string,
  ): Promise<JoinRequestRespondResponseDto> {
    return this.joinRequestsService.respondToRequest(
      requestId,
      payload.action,
      userId,
    );
  }
}
