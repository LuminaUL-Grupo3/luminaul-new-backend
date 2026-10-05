import { Injectable, ConflictException } from '@nestjs/common';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { JoinRequestEntity } from './entities/join-request.entity';
import { GroupMemberEntity } from '../groups/entities/group-member.entity';
import { GroupEntity } from '../groups/entities/group.entity';
import { GroupsRepository } from '../groups/groups.repository';

/** Código de PostgreSQL para violación de restricción UNIQUE. */
const PG_UNIQUE_VIOLATION = '23505';

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
   * H.U 2.1 — Buscar la solicitud PENDIENTE de un alumno hacia un grupo.
   * Retorna null si el alumno no tiene ninguna solicitud pendiente en ese grupo.
   */
  async findPendingByGroupAndRequester(
    groupId: string,
    requesterId: string,
  ): Promise<JoinRequestEntity | null> {
    return this.requestRepo.findOne({
      where: { groupId, requesterId, status: 'pending' },
    });
  }

  /**
   * H.U 2.1 — Registrar una nueva solicitud en estado 'pending'.
   *
   * La BD tiene el índice único parcial ux_join_requests_pending_unique
   * (group_id, requester_id) WHERE status = 'pending'. Si dos peticiones llegan
   * al mismo tiempo (doble click), ambas pueden pasar la validación del Service,
   * pero PostgreSQL rechaza la segunda con el error 23505. En ese caso se retorna
   * null ("ya existía una pendiente") y el Service decide el mensaje al usuario.
   * El Repository no lanza excepciones HTTP: solo informa lo que pasó en la BD.
   *
   * Retorna la solicitud creada con sus relaciones (grupo y solicitante con perfil).
   */
  async createPending(
    groupId: string,
    requesterId: string,
    message: string,
  ): Promise<JoinRequestEntity | null> {
    try {
      const request = this.requestRepo.create({
        groupId,
        requesterId,
        message,
        status: 'pending',
      });
      const saved = await this.requestRepo.save(request);
      return this.findById(saved.id);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = (error as QueryFailedError & { driverError?: { code?: string } })
      .driverError;
    return driverError?.code === PG_UNIQUE_VIOLATION;
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
      // 1. Bloquear el grupo para serializar validación de capacidad y alta de miembro
      const group = await manager
        .getRepository(GroupEntity)
        .createQueryBuilder('group')
        .setLock('pessimistic_write')
        .where('group.id = :groupId', { groupId: request.groupId })
        .andWhere('group.deletedAt IS NULL')
        .getOne();

      if (!group) {
        throw new ConflictException('El grupo no está disponible');
      }

      if (group.maxCapacity) {
        const currentMembers = await manager
          .getRepository(GroupMemberEntity)
          .count({ where: { groupId: request.groupId } });
        if (currentMembers >= group.maxCapacity) {
          throw new ConflictException('El grupo ha alcanzado su capacidad máxima');
        }
      }

      const now = new Date();
      const updateResult = await manager
        .createQueryBuilder()
        .update(JoinRequestEntity)
        .set({
          status: 'accepted',
          reviewedAt: now,
          reviewedById: reviewerId,
          respondedAt: now,
        })
        .where('id = :requestId', { requestId: request.id })
        .andWhere('status = :pendingStatus', { pendingStatus: 'pending' })
        .execute();

      if (updateResult.affected !== 1) {
        throw new ConflictException('La solicitud ya ha sido procesada anteriormente');
      }

      // 2. Registrar miembro en group_members si aún no lo es
      await this.groupsRepository.addMember(
        request.groupId,
        request.requesterId,
        'member',
        manager,
      );

      return manager.findOneOrFail(JoinRequestEntity, {
        where: { id: request.id },
        relations: ['group', 'requester', 'requester.profile'],
      });
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
    const result = await this.requestRepo.createQueryBuilder().update(JoinRequestEntity)
      .set({ status: 'rejected', reviewedAt: now, reviewedById: reviewerId, respondedAt: now })
      .where('id = :id', { id: request.id })
      .andWhere('status = :status', { status: 'pending' }).execute();
    if (result.affected !== 1) throw new ConflictException('La solicitud ya ha sido procesada anteriormente');
    return this.requestRepo.findOneOrFail({ where: { id: request.id }, relations: ['group', 'requester', 'requester.profile'] });
  }
}
