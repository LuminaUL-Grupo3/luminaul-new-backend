import { Injectable, ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { JoinRequestEntity } from './entities/join-request.entity';
import { GroupMemberEntity } from '../groups/entities/group-member.entity';
import { GroupEntity } from '../groups/entities/group.entity';
import { GroupsRepository } from '../groups/groups.repository';

@Injectable()
export class JoinRequestsRepository {
  constructor(
    @InjectRepository(JoinRequestEntity)
    private readonly requestRepo: Repository<JoinRequestEntity>,
    @InjectRepository(GroupMemberEntity)
    private readonly memberRepo: Repository<GroupMemberEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
    private readonly groupsRepository: GroupsRepository,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Buscar solicitud por ID incluyendo el grupo, el solicitante y su perfil, y el revisor.
   */
  async findById(requestId: string): Promise<JoinRequestEntity | null> {
    return this.requestRepo
      .createQueryBuilder('req')
      .leftJoinAndSelect('req.group', 'group')
      .leftJoinAndSelect('req.requester', 'requester')
      .leftJoinAndSelect('requester.profile', 'profile')
      .leftJoinAndSelect('req.reviewer', 'reviewer')
      .where('req.id = :requestId', { requestId })
      .getOne();
  }

  /**
   * Buscar grupo activo por ID asegurando que no esté eliminado lógicamente.
   */
  async findGroupById(groupId: string): Promise<GroupEntity | null> {
    return this.groupsRepository.findActiveById(groupId);
  }

  /**
   * Obtener IDs de todos los grupos activos administrados por un usuario.
   */
  async findAdminGroupIds(adminId: string): Promise<string[]> {
    return this.groupsRepository.findActiveGroupIdsByAdmin(adminId);
  }

  /**
   * Listar solicitudes pendientes de todos los grupos donde el usuario es administrador.
   * Incluye datos del solicitante (con perfil) y del grupo.
   */
  async findPendingByAdmin(adminId: string): Promise<JoinRequestEntity[]> {
    return this.requestRepo
      .createQueryBuilder('req')
      .innerJoinAndSelect('req.group', 'group')
      .leftJoinAndSelect('req.requester', 'requester')
      .leftJoinAndSelect('requester.profile', 'profile')
      .where('group.adminId = :adminId', { adminId })
      .andWhere('group.deletedAt IS NULL')
      .andWhere('req.status = :status', { status: 'pending' })
      .orderBy('req.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Aceptar solicitud en una transacción atómica:
   * 1. Valida que el grupo no haya superado max_capacity (regla DDL).
   * 2. Actualiza estado de solicitud a 'accepted', reviewed_at a NOW() y reviewed_by al admin.
   * 3. Registra al usuario en la tabla `group_members` como 'member'.
   */
  async acceptRequest(
    request: JoinRequestEntity,
    reviewerId: string,
  ): Promise<JoinRequestEntity> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Validar regla de capacidad máxima
      const isFull = await this.groupsRepository.isGroupFull(request.groupId, manager);
      if (isFull) {
        throw new ConflictException('El grupo ha alcanzado su capacidad máxima');
      }

      const now = new Date();
      request.status = 'accepted';
      request.reviewedAt = now;
      request.reviewedById = reviewerId;
      request.reviewer = { id: reviewerId } as any;
      request.respondedAt = now; // Retrocompatibilidad
      const updatedRequest = await manager.save(JoinRequestEntity, request);
      updatedRequest.reviewedById = reviewerId;

      // 2. Registrar miembro en group_members si aún no lo es
      await this.groupsRepository.addMember(
        request.groupId,
        request.requesterId,
        'member',
        manager,
      );

      return updatedRequest;
    });
  }

  /**
   * Rechazar solicitud:
   * Actualiza estado a 'rejected', reviewed_at a NOW() y reviewed_by al admin.
   * Permanece en BD para auditoría pero queda excluida del listado 'pending'.
   */
  async rejectRequest(
    request: JoinRequestEntity,
    reviewerId: string,
  ): Promise<JoinRequestEntity> {
    const now = new Date();
    request.status = 'rejected';
    request.reviewedAt = now;
    request.reviewedById = reviewerId;
    request.reviewer = { id: reviewerId } as any;
    request.respondedAt = now; // Retrocompatibilidad
    const updatedRequest = await this.requestRepo.save(request);
    updatedRequest.reviewedById = reviewerId;
    return updatedRequest;
  }
}
