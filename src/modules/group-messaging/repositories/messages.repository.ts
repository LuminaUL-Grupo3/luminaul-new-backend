import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { GroupsRepository } from "./groups.repository";
import {
  WsSendMessageDto,
  WsReactionDto,
  WsReadMessageDto,
} from "../dto/chat.dto";
import { MessageHistoryQueryDto } from "../dto/group.dto";
import { GroupMessageDto, MessageStatus } from "../types/messaging.types";

type MessageRow = GroupMessageDto;
interface StoredMessage {
  id: string;
  content: string;
  replyToId: string | null;
  status: MessageStatus;
}

/** DAO del chat: historial, reintentos, reacciones y lectura permanecen en PostgreSQL. */
@Injectable()
export class MessagesRepository {
  constructor(
    private readonly db: DataSource,
    private readonly groups: GroupsRepository,
  ) {}

  /** Oculta el texto moderado también en respuestas citadas y devuelve agregados tipados. */
  private selection(): string {
    return `SELECT m.id,m.group_id AS "groupId",m.sender_id AS "senderId",
      CASE WHEN m.status='published' THEN m.content ELSE '' END AS content,m.status,
      to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
      m.client_message_id AS "clientMessageId",
      json_build_object('id',u.id,'name',COALESCE(p.name,u.name),'profilePhotoUrl',p.profile_photo_url) AS sender,
      CASE WHEN parent.id IS NOT NULL THEN json_build_object('id',parent.id,'senderName',pu.name,
        'content',CASE WHEN parent.status='published' AND parent.deleted_at IS NULL THEN parent.content ELSE NULL END,
        'status',CASE WHEN parent.deleted_at IS NOT NULL THEN 'deleted' ELSE parent.status END) ELSE NULL END AS "replyTo",
      COALESCE((SELECT json_agg(json_build_object('emoji',rx.emoji,'userIds',rx.users) ORDER BY rx.emoji) FROM
        (SELECT r.emoji,json_agg(r.user_id ORDER BY r.user_id) AS users FROM message_reactions r WHERE r.message_id=m.id GROUP BY r.emoji) rx),'[]'::json) AS reactions,
      COALESCE((SELECT json_agg(json_build_object('userId',rm.user_id,'name',ru.name) ORDER BY rm.user_id)
        FROM group_read_markers rm JOIN users ru ON ru.id=rm.user_id
        WHERE rm.group_id=m.group_id AND rm.user_id<>m.sender_id AND (rm.last_created_at,rm.last_message_id)>=(m.created_at,m.id)),'[]'::json) AS "readBy"
      FROM group_messages m JOIN users u ON u.id=m.sender_id LEFT JOIN profiles p ON p.user_id=u.id
      LEFT JOIN group_messages parent ON parent.id=m.reply_to_id AND parent.group_id=m.group_id LEFT JOIN users pu ON pu.id=parent.sender_id`;
  }

  /** Recupera el mensaje ya persistido con su estado de moderación vigente. */
  async find(groupId: string, messageId: string): Promise<GroupMessageDto> {
    const rows: MessageRow[] = await this.db.query(
      `${this.selection()} WHERE m.id=$1 AND m.group_id=$2 AND m.deleted_at IS NULL AND m.status<>'deleted'`,
      [messageId, groupId],
    );
    if (!rows[0])
      throw new NotFoundException("El mensaje ya no está disponible.");
    return rows[0];
  }

  /** Selecciona primero los mensajes recientes y los devuelve cronológicamente para la vista. */
  async history(
    groupId: string,
    userId: string,
    query: MessageHistoryQueryDto,
  ): Promise<GroupMessageDto[]> {
    await this.groups.requireMember(groupId, userId);
    const args: unknown[] = [groupId, query.limit, query.offset];
    let anchor = "";
    if (query.beforeId) {
      // La comparación conserva los microsegundos de PostgreSQL y evita saltos por nuevos mensajes.
      await this.find(groupId, query.beforeId);
      args.push(query.beforeId);
      anchor =
        " AND (m.created_at,m.id)<(SELECT created_at,id FROM group_messages WHERE id=$4 AND group_id=$1)";
    }
    const rows: MessageRow[] = await this.db.query(
      `${this.selection()} WHERE m.group_id=$1 AND m.deleted_at IS NULL AND m.status<>'deleted'${anchor}
      ORDER BY m.created_at DESC,m.id DESC LIMIT $2 OFFSET $3`,
      args,
    );
    return rows.reverse();
  }

  /** Persiste una sola vez cada intento y comprueba la membresía dentro del bloqueo del grupo. */
  async insert(
    userId: string,
    dto: WsSendMessageDto,
  ): Promise<{ message: GroupMessageDto; created: boolean }> {
    const result = await this.db.transaction(async (manager) => {
      await this.groups.lock(manager, dto.groupId);
      await this.groups.requireMember(dto.groupId, userId, manager);
      if (dto.clientMessageId) {
        const previous: StoredMessage[] = await manager.query(
          `SELECT id,content,reply_to_id AS "replyToId",status FROM group_messages
          WHERE group_id=$1 AND sender_id=$2 AND client_message_id=$3`,
          [dto.groupId, userId, dto.clientMessageId],
        );
        if (previous[0]) {
          if (
            previous[0].content !== dto.content ||
            previous[0].replyToId !== (dto.replyToId || null)
          )
            throw new ConflictException(
              "Este identificador de envío ya pertenece a otro mensaje.",
            );
          return { id: previous[0].id, created: false };
        }
      }
      if (dto.replyToId) {
        const parent: { id: string }[] = await manager.query(
          "SELECT id FROM group_messages WHERE id=$1 AND group_id=$2 AND status='published' AND deleted_at IS NULL",
          [dto.replyToId, dto.groupId],
        );
        if (!parent.length)
          throw new NotFoundException(
            "El mensaje al que respondes ya no está disponible.",
          );
      }
      const inserted: { id: string }[] = await manager.query(
        `INSERT INTO group_messages(group_id,sender_id,content,client_message_id,reply_to_id)
        VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [
          dto.groupId,
          userId,
          dto.content,
          dto.clientMessageId || null,
          dto.replyToId || null,
        ],
      );
      return { id: inserted[0].id, created: true };
    });
    return {
      message: await this.find(dto.groupId, result.id),
      created: result.created,
    };
  }

  /** Añadir dos veces la misma reacción o retirar una inexistente produce el mismo estado final. */
  async reaction(
    userId: string,
    dto: WsReactionDto,
    add: boolean,
  ): Promise<GroupMessageDto> {
    await this.db.transaction(async (manager) => {
      await this.groups.lock(manager, dto.groupId);
      await this.groups.requireMember(dto.groupId, userId, manager);
      const rows: { id: string }[] = await manager.query(
        "SELECT id FROM group_messages WHERE id=$1 AND group_id=$2 AND status='published' AND deleted_at IS NULL FOR UPDATE",
        [dto.messageId, dto.groupId],
      );
      if (!rows.length)
        throw new NotFoundException("No puedes reaccionar a este mensaje.");
      if (add)
        await manager.query(
          "INSERT INTO message_reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [dto.messageId, userId, dto.emoji],
        );
      else
        await manager.query(
          "DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3",
          [dto.messageId, userId, dto.emoji],
        );
    });
    return this.find(dto.groupId, dto.messageId);
  }

  /** Guarda un marcador monotónico; una pestaña atrasada nunca deshace una lectura más reciente. */
  async read(
    userId: string,
    dto: WsReadMessageDto,
  ): Promise<{ groupId: string; userId: string; messageId: string }> {
    await this.db.transaction(async (manager) => {
      await this.groups.lock(manager, dto.groupId);
      await this.groups.requireMember(dto.groupId, userId, manager);
      const rows: { id: string }[] = await manager.query(
        "SELECT id FROM group_messages WHERE id=$1 AND group_id=$2 AND status<>'deleted' AND deleted_at IS NULL",
        [dto.messageId, dto.groupId],
      );
      if (!rows.length)
        throw new NotFoundException("No encontramos ese mensaje en el grupo.");
      await manager.query(
        `INSERT INTO group_read_markers(group_id,user_id,last_message_id,last_created_at)
        SELECT group_id,$2,id,created_at FROM group_messages WHERE id=$1
        ON CONFLICT(group_id,user_id) DO UPDATE SET last_message_id=EXCLUDED.last_message_id,last_created_at=EXCLUDED.last_created_at,read_at=NOW()
        WHERE (EXCLUDED.last_created_at,EXCLUDED.last_message_id)>(group_read_markers.last_created_at,group_read_markers.last_message_id)`,
        [dto.messageId, userId],
      );
    });
    const rows: { messageId: string }[] = await this.db.query(
      'SELECT last_message_id AS "messageId" FROM group_read_markers WHERE group_id=$1 AND user_id=$2',
      [dto.groupId, userId],
    );
    return { groupId: dto.groupId, userId, messageId: rows[0].messageId };
  }
}
