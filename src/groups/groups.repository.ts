import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { GroupEntity } from './entities/group.entity';
import { GroupMemberEntity } from './entities/group-member.entity';

export interface CreateGroupInput {
  name: string;
  description?: string | null;
  benefits?: string | null;
  requirements?: string | null;
  meetingMode?: string | null;
  meetingShift?: string | null;
  maxCapacity?: number | null;
}

@Injectable()
export class GroupsRepository {
  constructor(
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
    @InjectRepository(GroupMemberEntity)
    private readonly memberRepo: Repository<GroupMemberEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Buscar un grupo activo por ID (excluye eliminados lógicamente).
   */
  async findActiveById(groupId: string): Promise<GroupEntity | null> {
    return this.groupRepo.findOne({
      where: { id: groupId, deletedAt: IsNull() },
      relations: ['members', 'admin'],
    });
  }

  /**
   * Obtener los IDs de todos los grupos activos administrados por un usuario.
   */
  async findActiveGroupIdsByAdmin(adminId: string): Promise<string[]> {
    const groups = await this.groupRepo.find({
      select: ['id'],
      where: { adminId, deletedAt: IsNull() },
    });
    return groups.map((g) => g.id);
  }

  /**
   * Contar miembros actuales de un grupo.
   */
  async countActiveMembers(groupId: string, manager?: EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(GroupMemberEntity) : this.memberRepo;
    return repo.count({ where: { groupId } });
  }

  /**
   * Verificar si un usuario ya es miembro de un grupo.
   */
  async isUserMember(groupId: string, userId: string, manager?: EntityManager): Promise<boolean> {
    const repo = manager ? manager.getRepository(GroupMemberEntity) : this.memberRepo;
    const member = await repo.findOne({ where: { groupId, userId } });
    return member !== null;
  }

  /**
   * Verifica si el grupo ha alcanzado su capacidad máxima (maxCapacity).
   * Si maxCapacity es null o indefinido, el grupo no tiene límite.
   */
  async isGroupFull(groupId: string, manager?: EntityManager): Promise<boolean> {
    const groupRepo = manager ? manager.getRepository(GroupEntity) : this.groupRepo;
    const group = await groupRepo.findOne({ where: { id: groupId, deletedAt: IsNull() } });
    if (!group || !group.maxCapacity) {
      return false;
    }

    const currentMembers = await this.countActiveMembers(groupId, manager);
    return currentMembers >= group.maxCapacity;
  }

  /**
   * Crear un nuevo grupo garantizando que el usuario administrador sea
   * registrado automáticamente en group_members con role = 'admin',
   * cumpliendo la regla de integridad de negocio del DDL.
   */
  async createWithAdmin(
    input: CreateGroupInput,
    adminId: string,
    externalManager?: EntityManager,
  ): Promise<GroupEntity> {
    const executeOperation = async (manager: EntityManager) => {
      const now = new Date();
      const group = manager.create(GroupEntity, {
        id: randomUUID(),
        name: input.name,
        description: input.description ?? null,
        benefits: input.benefits ?? null,
        requirements: input.requirements ?? null,
        meetingMode: input.meetingMode ?? null,
        meetingShift: input.meetingShift ?? null,
        maxCapacity: input.maxCapacity ?? null,
        adminId,
        createdAt: now,
      });

      const savedGroup = await manager.save(GroupEntity, group);

      // Inserción obligatoria del admin como miembro (regla DDL)
      const adminMembership = manager.create(GroupMemberEntity, {
        groupId: savedGroup.id,
        userId: adminId,
        role: 'admin',
        joinedAt: now,
      });
      await manager.save(GroupMemberEntity, adminMembership);

      return savedGroup;
    };

    if (externalManager) {
      return executeOperation(externalManager);
    }
    return this.dataSource.transaction(executeOperation);
  }

  /**
   * Registrar un nuevo miembro en el grupo.
   */
  async addMember(
    groupId: string,
    userId: string,
    role: string = 'member',
    externalManager?: EntityManager,
  ): Promise<GroupMemberEntity> {
    const execute = async (manager: EntityManager) => {
      const existing = await manager.findOne(GroupMemberEntity, {
        where: { groupId, userId },
      });
      if (existing) {
        return existing;
      }

      const member = manager.create(GroupMemberEntity, {
        groupId,
        userId,
        role,
        joinedAt: new Date(),
      });
      return manager.save(GroupMemberEntity, member);
    };

    if (externalManager) {
      return execute(externalManager);
    }
    return this.dataSource.transaction(execute);
  }

  /**
   * Borrado lógico del grupo. No borra filas físicamente.
   */
  async softDelete(groupId: string, adminId: string): Promise<boolean> {
    const group = await this.groupRepo.findOne({
      where: { id: groupId, adminId, deletedAt: IsNull() },
    });
    if (!group) {
      return false;
    }

    group.deletedAt = new Date();
    await this.groupRepo.save(group);
    return true;
  }
}
