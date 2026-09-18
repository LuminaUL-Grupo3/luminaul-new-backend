import { Injectable } from '@nestjs/common';
import { DataSource, Repository, IsNull } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { JoinRequestEntity } from './entities/join-request.entity';
import { GroupMemberEntity } from '../groups/entities/group-member.entity';
import { GroupEntity } from '../groups/entities/group.entity';

@Injectable()
export class JoinRequestsRepository {
  constructor(
    @InjectRepository(JoinRequestEntity)
    private readonly requestRepo: Repository<JoinRequestEntity>,
    @InjectRepository(GroupMemberEntity)
    private readonly memberRepo: Repository<GroupMemberEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Buscar solicitud por ID incluyendo el grupo, el solicitante y su perfil.
   */
  async findById(requestId: string): Promise<JoinRequestEntity | null> {
    return this.requestRepo
      .createQueryBuilder('req')
      .leftJoinAndSelect('req.group', 'group')
      .leftJoinAndSelect('req.requester', 'requester')
      .leftJoinAndSelect('requester.profile', 'profile')
      .where('req.id = :requestId', { requestId })
      .getOne();
  }

  /**
   * Buscar grupo por ID asegurando que no esté eliminado lógicamente.
   */
  async findGroupById(groupId: string): Promise<GroupEntity | null> {
    return this.groupRepo.findOne({
      where: { id: groupId, deletedAt: IsNull() },
    });
  }

  /**
   * Obtener IDs de todos los grupos activos administrados por un usuario.
   */
  async findAdminGroupIds(adminId: string): Promise<string[]> {
    const groups = await this.groupRepo.find({
      select: ['id'],
      where: { adminId, deletedAt: IsNull() },
    });
    return groups.map((g) => g.id);
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
   * 1. Actualiza estado de solicitud a 'accepted' y responded_at a NOW().
   * 2. Registra al usuario en la tabla `group_members` como 'member'.
   */
  async acceptRequest(request: JoinRequestEntity): Promise<JoinRequestEntity> {
    return this.dataSource.transaction(async (manager) => {
      const now = new Date();
      request.status = 'accepted';
      request.respondedAt = now;
      const updatedRequest = await manager.save(JoinRequestEntity, request);

      const existingMember = await manager.findOne(GroupMemberEntity, {
        where: { groupId: request.groupId, userId: request.requesterId },
      });

      if (!existingMember) {
        const member = manager.create(GroupMemberEntity, {
          groupId: request.groupId,
          userId: request.requesterId,
          role: 'member',
          joinedAt: now,
        });
        await manager.save(GroupMemberEntity, member);
      }

      return updatedRequest;
    });
  }

  /**
   * Rechazar solicitud:
   * Actualiza estado a 'rejected' y responded_at a NOW().
   * Permanece en BD para auditoría pero queda excluida del listado 'pending'.
   */
  async rejectRequest(request: JoinRequestEntity): Promise<JoinRequestEntity> {
    request.status = 'rejected';
    request.respondedAt = new Date();
    return this.requestRepo.save(request);
  }
}
