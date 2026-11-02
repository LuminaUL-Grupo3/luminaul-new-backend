import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { GroupsRepository } from "./repositories/groups.repository";
import { MessagesRepository } from "./repositories/messages.repository";
import {
  CreateGroupDto,
  GroupFilterDto,
  MessageHistoryQueryDto,
} from "./dto/group.dto";
import {
  WsReactionDto,
  WsReadMessageDto,
  WsSendMessageDto,
} from "./dto/chat.dto";

/** Orquesta las reglas del dominio sin conocer HTTP, Socket.IO ni entidades de otros módulos. */
@Injectable()
export class GroupMessagingService {
  constructor(
    private readonly groups: GroupsRepository,
    private readonly messages: MessagesRepository,
    private readonly events: EventEmitter2,
  ) {}
  /** Consulta el directorio o los grupos propios con los mismos filtros. */
  list(userId: string, query: GroupFilterDto, mine = false) {
    return this.groups.list(userId, query, mine);
  }
  /** Precarga el detalle público y la situación real del usuario. */
  detail(groupId: string, userId: string) {
    return this.groups.detail(groupId, userId);
  }
  /** Devuelve miembros activos exclusivamente a integrantes del grupo. */
  members(groupId: string, userId: string) {
    return this.groups.members(groupId, userId);
  }
  /** Crea el grupo y luego proyecta su contrato de respuesta. */
  async create(userId: string, dto: CreateGroupDto) {
    return this.groups.detail(await this.groups.create(userId, dto), userId);
  }
  /** Registra la postulación y devuelve su identificador persistido. */
  async requestJoin(groupId: string, userId: string, message?: string) {
    const id = await this.groups.requestJoin(groupId, userId, message);
    return {
      id,
      status: "pending" as const,
      message: "Solicitud enviada con éxito.",
    };
  }
  /** Lista las solicitudes pendientes de los grupos que lidera el usuario. */
  requests(userId: string, groupId?: string) {
    return this.groups.requests(userId, groupId);
  }
  /** Persiste la decisión antes de avisar que las listas de grupos cambiaron. */
  async decide(
    groupId: string,
    requestId: string,
    userId: string,
    status: "approved" | "rejected",
  ) {
    await this.groups.decide(groupId, requestId, userId, status);
    this.events.emit("group.changed", { groupId });
    return {
      message:
        status === "approved"
          ? "Solicitud aceptada correctamente."
          : "Solicitud rechazada correctamente.",
    };
  }
  /** Conserva la ruta de decisión anterior sin duplicar la lógica de aprobación. */
  async decideLegacy(
    requestId: string,
    userId: string,
    status: "approved" | "rejected",
  ) {
    return this.decide(
      await this.groups.requestGroup(requestId, userId),
      requestId,
      userId,
      status,
    );
  }
  /** Notifica la retirada después del commit para expulsar de todas las pestañas conectadas. */
  async remove(
    groupId: string,
    userId: string,
    targetId: string,
    status: "left" | "kicked",
  ) {
    await this.groups.removeMember(groupId, userId, targetId, status);
    await this.events.emitAsync("group.member_removed", {
      groupId,
      userId: targetId,
    });
    return {
      message:
        status === "left" ? "Saliste del grupo." : "Integrante expulsado.",
    };
  }
  /** Transfiere el liderazgo sin permitir que existan dos líderes activos. */
  async transfer(groupId: string, userId: string, targetId: string) {
    await this.groups.transfer(groupId, userId, targetId);
    this.events.emit("group.changed", { groupId });
    return { message: "Liderazgo transferido correctamente." };
  }
  /** Reutiliza la misma autorización para la sala y para el historial REST. */
  requireMember(groupId: string, userId: string) {
    return this.groups.requireMember(groupId, userId);
  }
  /** Recupera una página estable de mensajes para reconstruir una conexión interrumpida. */
  history(groupId: string, userId: string, query: MessageHistoryQueryDto) {
    return this.messages.history(groupId, userId, query);
  }
  /** Publica el evento formal de moderación solo cuando realmente se creó un mensaje. */
  async send(userId: string, dto: WsSendMessageDto) {
    const result = await this.messages.insert(userId, dto);
    if (result.created)
      this.events.emit("content.created", {
        contentType: "message",
        contentId: result.message.id,
        authorId: userId,
        text: dto.content,
        groupId: dto.groupId,
      });
    return result;
  }
  /** Agrega o retira una reacción propia y devuelve el agregado definitivo de la base. */
  reaction(userId: string, dto: WsReactionDto, add: boolean) {
    return this.messages.reaction(userId, dto, add);
  }
  /** Actualiza el límite de lectura sin crear una fila por cada mensaje visualizado. */
  read(userId: string, dto: WsReadMessageDto) {
    return this.messages.read(userId, dto);
  }
  /** Permite a la integración de moderación verificar el estado persistido antes de difundirlo. */
  message(groupId: string, messageId: string) {
    return this.messages.find(groupId, messageId);
  }
}
