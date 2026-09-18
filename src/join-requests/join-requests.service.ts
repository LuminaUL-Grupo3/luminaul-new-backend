import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { JoinRequestsRepository } from './join-requests.repository';
import { JoinRequestEntity } from './entities/join-request.entity';
import {
  JoinRequestItemDto,
  JoinRequestRespondResponseDto,
} from './dto/join-request-response.dto';
import { JoinRequestListResponseDto } from './dto/join-request-list-response.dto';

@Injectable()
export class JoinRequestsService {
  constructor(
    private readonly joinRequestsRepository: JoinRequestsRepository,
  ) {}

  /**
   * Listar todas las solicitudes pendientes de todos los grupos administrados por el usuario.
   * Si la lista está vacía, devuelve el mensaje "No hay solicitudes pendientes por revisar".
   */
  async listMyRequests(userId: string): Promise<JoinRequestListResponseDto> {
    const entities = await this.joinRequestsRepository.findPendingByAdmin(userId);
    const requests = entities.map((entity) => this.mapToItemDto(entity));
    const total = requests.length;

    return {
      requests,
      total,
      message: total === 0 ? 'No hay solicitudes pendientes por revisar' : null,
    };
  }

  /**
   * Responder a una solicitud de unión (aceptar o rechazar).
   *
   * Validaciones de regla de negocio:
   * 1. La solicitud debe existir en la base de datos (404).
   * 2. El grupo debe existir y no estar borrado lógicamente (404).
   * 3. El usuario autenticado debe ser el administrador del grupo (403).
   * 4. La solicitud debe encontrarse en estado 'pending' (409).
   */
  async respondToRequest(
    requestId: string,
    action: 'accepted' | 'rejected',
    userId: string,
  ): Promise<JoinRequestRespondResponseDto> {
    const request = await this.joinRequestsRepository.findById(requestId);
    if (!request) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    const group = await this.joinRequestsRepository.findGroupById(request.groupId);
    if (!group) {
      throw new NotFoundException('Grupo no encontrado o eliminado');
    }

    if (group.adminId !== userId) {
      throw new ForbiddenException(
        'No tienes permisos para gestionar solicitudes de este grupo',
      );
    }

    if (request.status !== 'pending') {
      throw new ConflictException('La solicitud ya ha sido procesada anteriormente');
    }

    let updated: JoinRequestEntity;
    let message: string;

    if (action === 'accepted') {
      updated = await this.joinRequestsRepository.acceptRequest(request, userId);
      message = 'Solicitud aceptada exitosamente';
    } else {
      updated = await this.joinRequestsRepository.rejectRequest(request, userId);
      message = 'Solicitud rechazada exitosamente';
    }

    return {
      request: this.mapToItemDto(updated),
      message,
    };
  }

  /**
   * Mapper privado: Convierte una entidad JoinRequestEntity a JoinRequestItemDto.
   */
  private mapToItemDto(entity: JoinRequestEntity): JoinRequestItemDto {
    const profile = entity.requester?.profile;
    const reviewedAt = entity.reviewedAt ?? entity.respondedAt ?? null;
    return {
      id: entity.id,
      group: {
        group_id: entity.groupId,
        group_name: entity.group?.name ?? '',
      },
      requester: {
        user_id: entity.requesterId,
        name: profile?.name ?? '',
        profile_photo_url: profile?.profilePhotoUrl ?? null,
      },
      status: entity.status,
      message: entity.message ?? null,
      created_at: entity.createdAt,
      reviewed_at: reviewedAt,
      reviewed_by: entity.reviewedById ?? entity.reviewer?.id ?? null,
      responded_at: reviewedAt,
    };
  }
}
