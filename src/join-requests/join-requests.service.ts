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
import { CreateJoinRequestResponseDto } from './dto/create-join-request-response.dto';
import { GroupsRepository } from '../groups/groups.repository';

/** Mensajes de la H.U 2.1 (textos de los criterios de aceptación). */
export const JOIN_REQUEST_MESSAGES = {
  CREATED: 'Solicitud enviada con éxito',
  GROUP_NOT_FOUND: 'Grupo no encontrado o eliminado',
  ALREADY_MEMBER: 'Ya perteneces a este grupo',
  ALREADY_PENDING: 'Ya tienes una solicitud pendiente para este grupo',
} as const;

@Injectable()
export class JoinRequestsService {
  constructor(
    private readonly joinRequestsRepository: JoinRequestsRepository,
    private readonly groupsRepository: GroupsRepository,
  ) {}

  /**
   * H.U 2.1 — Enviar solicitud de unión a un grupo de estudio.
   *
   * Reglas de negocio (en este orden):
   * 1. El grupo debe existir y no estar eliminado lógicamente      → 404
   * 2. El alumno no debe ser ya miembro (ni admin) del grupo         → 409 (escenario 3)
   * 3. El alumno no debe tener otra solicitud pendiente en el grupo  → 409 (escenario 2)
   * 4. Se registra la solicitud en estado 'pending'                  → 201 (escenario 1)
   *    Si la BD detecta un duplicado simultáneo (doble click), se responde
   *    igual que en la regla 3.
   */
  async createRequest(
    groupId: string,
    requesterId: string,
    message: string,
  ): Promise<CreateJoinRequestResponseDto> {
    const group = await this.groupsRepository.findActiveById(groupId);
    if (!group) {
      throw new NotFoundException(JOIN_REQUEST_MESSAGES.GROUP_NOT_FOUND);
    }

    const isMember = await this.groupsRepository.isUserMember(groupId, requesterId);
    if (isMember) {
      throw new ConflictException(JOIN_REQUEST_MESSAGES.ALREADY_MEMBER);
    }

    const pendingRequest = await this.joinRequestsRepository.findPendingByGroupAndRequester(
      groupId,
      requesterId,
    );
    if (pendingRequest) {
      throw new ConflictException(JOIN_REQUEST_MESSAGES.ALREADY_PENDING);
    }

    const created = await this.joinRequestsRepository.createPending(
      groupId,
      requesterId,
      message,
    );
    if (!created) {
      throw new ConflictException(JOIN_REQUEST_MESSAGES.ALREADY_PENDING);
    }

    return {
      request: this.mapToItemDto(created),
      message: JOIN_REQUEST_MESSAGES.CREATED,
    };
  }

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
