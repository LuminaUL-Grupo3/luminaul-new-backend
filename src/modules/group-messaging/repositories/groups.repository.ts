import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { CreateGroupDto, GroupFilterDto } from "../dto/group.dto";
import {
  GroupDetailDto,
  GroupMemberDto,
  JoinRequestDto,
  MemberStatus,
  GroupRole,
} from "../types/messaging.types";

export interface LockedGroup {
  id: string;
  leaderId: string;
  maxCapacity: number;
}
interface GroupRow extends Omit<GroupDetailDto, "createdAt" | "lastActivity"> {
  createdAt: Date;
  lastActivity: Date;
}
interface MemberRow extends Omit<GroupMemberDto, "joinedAt"> {
  joinedAt: Date;
}
interface RequestRow extends Omit<JoinRequestDto, "createdAt"> {
  createdAt: Date;
}

/** DAO del dominio de grupos: las consultas a cuentas/perfiles usan SQL, nunca entidades externas. */
@Injectable()
export class GroupsRepository {
  constructor(private readonly db: DataSource) {}

  /** Proyecta el contrato canónico y el estado mínimo que necesita el feed ya existente. */
  private selectGroups(): string {
    return `SELECT g.id,g.name,g.description,g.benefits,g.requirements,g.course_code AS "courseCode",
      COALESCE(g.leader_id,g.admin_id) AS "leaderId", COALESCE(g.meeting_mode,'virtual') AS "meetingMode",
      COALESCE(g.meeting_shift,'manana') AS "meetingShift",COALESCE(g.max_capacity,6) AS "maxCapacity",
      (SELECT COUNT(*)::int FROM group_members cm WHERE cm.group_id=g.id AND cm.status='active') AS "currentMembers",
      json_build_object('id',u.id,'name',COALESCE(p.name,u.name),'profilePhotoUrl',p.profile_photo_url) AS leader,
      CASE WHEN mine.status='active' THEN CASE WHEN mine.user_id=COALESCE(g.leader_id,g.admin_id) THEN 'leader' ELSE 'member' END ELSE NULL END AS "myRole",
      COALESCE(mine.status,'none') AS "myStatus",g.created_at AS "createdAt",
      EXISTS(SELECT 1 FROM join_requests j WHERE j.group_id=g.id AND j.user_id=$1 AND j.status='pending') AS "pendingRequest",
      CASE WHEN mine.status='active' THEN CASE WHEN mine.user_id=COALESCE(g.leader_id,g.admin_id) THEN 'leader' ELSE 'member' END
        WHEN EXISTS(SELECT 1 FROM join_requests j WHERE j.group_id=g.id AND j.user_id=$1 AND j.status='pending') THEN 'pending' ELSE 'none' END AS my_status,
      CASE WHEN mine.status='active' THEN (SELECT CASE WHEN msg.status='hidden' THEN 'Mensaje oculto por moderación' ELSE msg.content END FROM group_messages msg
        WHERE msg.group_id=g.id AND msg.status<>'deleted' AND msg.deleted_at IS NULL ORDER BY msg.created_at DESC,msg.id DESC LIMIT 1) ELSE NULL END AS "lastMessage",
      COALESCE((SELECT MAX(msg.created_at) FROM group_messages msg WHERE msg.group_id=g.id AND msg.status<>'deleted' AND msg.deleted_at IS NULL),g.created_at) AS "lastActivity",
      CASE WHEN mine.status='active' THEN (SELECT COUNT(*)::int FROM group_messages msg LEFT JOIN group_read_markers rm ON rm.group_id=msg.group_id AND rm.user_id=$1
        WHERE msg.group_id=g.id AND msg.sender_id<>$1 AND msg.status='published' AND msg.deleted_at IS NULL
        AND (rm.last_message_id IS NULL OR (msg.created_at,msg.id)>(rm.last_created_at,rm.last_message_id))) ELSE 0 END AS "unreadCount"
      FROM groups g JOIN users u ON u.id=COALESCE(g.leader_id,g.admin_id)
      LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN group_members mine ON mine.group_id=g.id AND mine.user_id=$1`;
  }

  /** Ordena Mis grupos por actividad; el directorio aplica filtros acotados y parámetros SQL. */
  async list(
    userId: string,
    filter: GroupFilterDto,
    mine = false,
  ): Promise<GroupDetailDto[]> {
    const parameters: unknown[] = [userId || null];
    let where = " WHERE g.deleted_at IS NULL";
    if (mine) where += " AND mine.status='active'";
    if (filter.courseCode) {
      parameters.push(filter.courseCode);
      where += ` AND g.course_code=$${parameters.length}`;
    }
    if (filter.meetingMode) {
      parameters.push(filter.meetingMode);
      where += ` AND g.meeting_mode=$${parameters.length}`;
    }
    parameters.push(filter.limit, filter.offset);
    const rows: GroupRow[] = await this.db.query(
      `${this.selectGroups()}${where} ORDER BY "lastActivity" DESC,g.id LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    );
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      lastActivity: row.lastActivity.toISOString(),
    }));
  }

  /** Devuelve información pública del grupo sin exponer su historial ni correos de miembros. */
  async detail(id: string, userId: string): Promise<GroupDetailDto> {
    const rows: GroupRow[] = await this.db.query(
      `${this.selectGroups()} WHERE g.id=$2 AND g.deleted_at IS NULL`,
      [userId || null, id],
    );
    if (!rows[0])
      throw new NotFoundException(
        "El grupo no existe o ya no está disponible.",
      );
    const row = rows[0];
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      lastActivity: row.lastActivity.toISOString(),
    };
  }

  /** Bloquea el grupo antes de aprobar, enviar o retirar miembros para serializar sus invariantes. */
  async lock(manager: EntityManager, groupId: string): Promise<LockedGroup> {
    const rows: LockedGroup[] = await manager.query(
      `SELECT id,COALESCE(leader_id,admin_id) AS "leaderId",COALESCE(max_capacity,6) AS "maxCapacity"
      FROM groups WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
      [groupId],
    );
    if (!rows[0])
      throw new NotFoundException(
        "El grupo no existe o ya no está disponible.",
      );
    return rows[0];
  }

  /** Revalida la pertenencia activa para impedir mensajes o lecturas tras abandonar el grupo. */
  async requireMember(
    groupId: string,
    userId: string,
    manager: EntityManager = this.db.manager,
  ): Promise<void> {
    const rows: { id: string }[] = await manager.query(
      `SELECT gm.id FROM group_members gm JOIN groups g ON g.id=gm.group_id
      JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 AND gm.user_id=$2 AND gm.status='active' AND g.deleted_at IS NULL
      AND u.status='active' AND u.deleted_at IS NULL AND u.is_verified=true`,
      [groupId, userId],
    );
    if (!rows.length)
      throw new ForbiddenException("No eres miembro activo del grupo.");
  }

  /** Cuenta únicamente miembros activos, sin perder las filas históricas de salidas/expulsiones. */
  async members(groupId: string, actorId: string): Promise<GroupMemberDto[]> {
    await this.requireMember(groupId, actorId);
    const rows: MemberRow[] = await this.db.query(
      `SELECT gm.user_id AS "userId",COALESCE(p.name,u.name) AS name,
      CASE WHEN gm.user_id=COALESCE(g.leader_id,g.admin_id) THEN 'leader' ELSE 'member' END AS role,gm.status,
      p.profile_photo_url AS "profilePhotoUrl",gm.joined_at AS "joinedAt"
      FROM group_members gm JOIN groups g ON g.id=gm.group_id JOIN users u ON u.id=gm.user_id LEFT JOIN profiles p ON p.user_id=u.id
      WHERE gm.group_id=$1 AND gm.status='active' ORDER BY (gm.user_id=COALESCE(g.leader_id,g.admin_id)) DESC,name,gm.user_id`,
      [groupId],
    );
    return rows.map((row) => ({
      ...row,
      joinedAt: row.joinedAt.toISOString(),
    }));
  }

  /** Grupo y membresía del creador se confirman juntos para evitar grupos sin líder. */
  async create(actorId: string, dto: CreateGroupDto): Promise<string> {
    return this.db.transaction(async (manager) => {
      const rows: { id: string }[] = await manager.query(
        `INSERT INTO groups(name,description,course_code,leader_id,admin_id,meeting_mode,meeting_shift,max_capacity)
        VALUES($1,$2,$3,$4,$4,$5,$6,$7) RETURNING id`,
        [
          dto.name,
          dto.description || null,
          dto.courseCode,
          actorId,
          dto.meetingMode,
          dto.meetingShift,
          dto.maxCapacity,
        ],
      );
      const id = rows[0].id;
      await manager.query(
        "INSERT INTO group_members(group_id,user_id,role,status) VALUES($1,$2,'leader','active')",
        [id, actorId],
      );
      return id;
    });
  }

  /** Impide solicitudes duplicadas y solicitudes de usuarios que ya pertenecen al grupo. */
  async requestJoin(
    groupId: string,
    actorId: string,
    message?: string,
  ): Promise<string> {
    return this.db.transaction(async (manager) => {
      const group = await this.lock(manager, groupId);
      const members: { status: MemberStatus }[] = await manager.query(
        "SELECT status FROM group_members WHERE group_id=$1 AND user_id=$2",
        [groupId, actorId],
      );
      if (members[0]?.status === "active")
        throw new ConflictException("Ya eres integrante de este grupo.");
      const pending: { id: string }[] = await manager.query(
        "SELECT id FROM join_requests WHERE group_id=$1 AND user_id=$2 AND status='pending'",
        [groupId, actorId],
      );
      if (pending.length)
        throw new ConflictException(
          "Ya tienes una solicitud pendiente para este grupo.",
        );
      await this.requireCapacity(manager, group);
      const inserted: { id: string }[] = await manager.query(
        "INSERT INTO join_requests(group_id,user_id,requester_id,message,status) VALUES($1,$2,$2,$3,'pending') RETURNING id",
        [groupId, actorId, message || null],
      );
      return inserted[0].id;
    });
  }

  /** Centraliza la comprobación del cupo dentro de la misma transacción que modifica la membresía. */
  private async requireCapacity(
    manager: EntityManager,
    group: LockedGroup,
  ): Promise<void> {
    const rows: { count: number }[] = await manager.query(
      "SELECT COUNT(*)::int AS count FROM group_members WHERE group_id=$1 AND status='active'",
      [group.id],
    );
    if (rows[0].count >= group.maxCapacity)
      throw new ConflictException("El grupo alcanzó su capacidad máxima.");
  }

  /** Proyecta solicitantes solo para el líder; los correos nunca aparecen en el directorio. */
  private requestQuery(): string {
    return `SELECT j.id,j.group_id AS "groupId",j.user_id AS "userId",g.name AS "groupName",j.status,j.message,j.created_at AS "createdAt",
      json_build_object('id',u.id,'name',COALESCE(p.name,u.name),'email',u.email,'profilePhotoUrl',p.profile_photo_url) AS applicant
      FROM join_requests j JOIN groups g ON g.id=j.group_id JOIN users u ON u.id=j.user_id LEFT JOIN profiles p ON p.user_id=u.id`;
  }

  /** Lista solicitudes del grupo o de todos los grupos que lidera el usuario autenticado. */
  async requests(actorId: string, groupId?: string): Promise<JoinRequestDto[]> {
    if (groupId) {
      const group = await this.detail(groupId, actorId);
      if (group.leaderId !== actorId)
        throw new ForbiddenException(
          "Solo el líder puede revisar solicitudes.",
        );
    }
    const rows: RequestRow[] = await this.db.query(
      `${this.requestQuery()} WHERE COALESCE(g.leader_id,g.admin_id)=$1 AND g.deleted_at IS NULL AND j.status='pending'
      ${groupId ? "AND g.id=$2" : ""} ORDER BY j.created_at,j.id`,
      groupId ? [actorId, groupId] : [actorId],
    );
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Resuelve una solicitud sin permitir que dos decisiones consuman el último cupo. */
  async decide(
    groupId: string,
    requestId: string,
    actorId: string,
    decision: "approved" | "rejected",
  ): Promise<void> {
    await this.db.transaction(async (manager) => {
      const group = await this.lock(manager, groupId);
      if (group.leaderId !== actorId)
        throw new ForbiddenException(
          "Solo el líder puede resolver solicitudes.",
        );
      const rows: { userId: string; status: string }[] = await manager.query(
        'SELECT user_id AS "userId",status FROM join_requests WHERE id=$1 AND group_id=$2 FOR UPDATE',
        [requestId, groupId],
      );
      if (!rows[0])
        throw new NotFoundException(
          "No encontramos esa solicitud en este grupo.",
        );
      if (rows[0].status !== "pending")
        throw new ConflictException("La solicitud ya fue resuelta.");
      if (decision === "approved") {
        const user: { id: string }[] = await manager.query(
          "SELECT id FROM users WHERE id=$1 AND status='active' AND deleted_at IS NULL AND is_verified=true",
          [rows[0].userId],
        );
        if (!user.length)
          throw new ConflictException(
            "La cuenta solicitante no está disponible.",
          );
        const member: { status: string }[] = await manager.query(
          "SELECT status FROM group_members WHERE group_id=$1 AND user_id=$2",
          [groupId, rows[0].userId],
        );
        if (member[0]?.status === "active")
          throw new ConflictException(
            "La membresía cambió. Actualiza las solicitudes.",
          );
        await this.requireCapacity(manager, group);
        await manager.query(
          `INSERT INTO group_members(group_id,user_id,role,status) VALUES($1,$2,'member','active')
          ON CONFLICT(group_id,user_id) DO UPDATE SET status='active',role='member',joined_at=NOW(),left_at=NULL`,
          [groupId, rows[0].userId],
        );
      }
      await manager.query(
        "UPDATE join_requests SET status=$3,reviewed_by=$4,reviewed_at=NOW(),responded_at=NOW() WHERE id=$1 AND group_id=$2",
        [requestId, groupId, decision, actorId],
      );
    });
  }

  /** Cambia el estado de pertenencia; nunca borra la fila histórica de un estudiante. */
  async removeMember(
    groupId: string,
    actorId: string,
    targetId: string,
    status: "left" | "kicked",
  ): Promise<void> {
    await this.db.transaction(async (manager) => {
      const group = await this.lock(manager, groupId);
      await this.requireMember(groupId, actorId, manager);
      if (targetId === group.leaderId)
        throw new ConflictException(
          "El líder debe transferir el liderazgo antes de salir.",
        );
      if (status === "kicked" && group.leaderId !== actorId)
        throw new ForbiddenException(
          "Solo el líder puede expulsar integrantes.",
        );
      if (status === "left" && targetId !== actorId)
        throw new ForbiddenException(
          "Solo puedes abandonar tu propia membresía.",
        );
      await this.requireMember(groupId, targetId, manager);
      await manager.query(
        "UPDATE group_members SET status=$3,left_at=NOW() WHERE group_id=$1 AND user_id=$2",
        [groupId, targetId, status],
      );
    });
  }

  /** Mantiene exactamente un líder activo al transferir las dos membresías y el grupo juntos. */
  async transfer(
    groupId: string,
    actorId: string,
    targetId: string,
  ): Promise<void> {
    await this.db.transaction(async (manager) => {
      const group = await this.lock(manager, groupId);
      if (group.leaderId !== actorId)
        throw new ForbiddenException(
          "Solo el líder puede transferir el liderazgo.",
        );
      if (actorId === targetId)
        throw new ConflictException("Elige otro integrante activo.");
      await this.requireMember(groupId, actorId, manager);
      await this.requireMember(groupId, targetId, manager);
      await manager.query(
        "UPDATE group_members SET role=CASE WHEN user_id=$2 THEN 'leader' ELSE 'member' END WHERE group_id=$1 AND status='active'",
        [groupId, targetId],
      );
      await manager.query(
        "UPDATE groups SET leader_id=$2,admin_id=$2 WHERE id=$1",
        [groupId, targetId],
      );
    });
  }

  /** Resuelve el identificador heredado sin conceder acceso a solicitudes de otros líderes. */
  async requestGroup(requestId: string, actorId: string): Promise<string> {
    const rows: { groupId: string }[] = await this.db.query(
      `SELECT j.group_id AS "groupId" FROM join_requests j JOIN groups g ON g.id=j.group_id
      WHERE j.id=$1 AND COALESCE(g.leader_id,g.admin_id)=$2 AND g.deleted_at IS NULL`,
      [requestId, actorId],
    );
    if (!rows[0])
      throw new NotFoundException(
        "La solicitud no está disponible para tu cuenta.",
      );
    return rows[0].groupId;
  }
}
