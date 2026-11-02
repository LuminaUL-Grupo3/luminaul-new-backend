import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  OnModuleDestroy,
} from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { OnEvent } from "@nestjs/event-emitter";
import { plainToInstance, ClassConstructor } from "class-transformer";
import { validate } from "class-validator";
import { Server, Socket } from "socket.io";
import { extractToken } from "../../../auth/token.util";
import { GroupSession } from "../security/group-session";
import { GroupMessagingService } from "../group-messaging.service";
import {
  WsJoinRoomDto,
  WsSendMessageDto,
  WsTypingDto,
  WsReactionDto,
  WsReadMessageDto,
} from "../dto/chat.dto";
import {
  ChatError,
  ChatIdentity,
  GroupMessageDto,
  HiddenMessageEvent,
  MembershipRemovedEvent,
  PresenceEvent,
  TypingEvent,
  WsAck,
} from "../types/messaging.types";
import { RoomPresence } from "./room-presence";

interface SocketState {
  token: string;
  user: ChatIdentity;
  budget?: { since: number; total: number };
}
interface ReadEvent {
  groupId: string;
  userId: string;
  messageId: string;
  name: string;
}
interface ClientEvents {
  [event: string]: (payload: unknown) => void;
}
interface ServerEvents {
  "chat:new_message": (message: GroupMessageDto) => void;
  "chat:message_updated": (message: GroupMessageDto) => void;
  "chat:message_hidden": (event: HiddenMessageEvent) => void;
  "chat:typing": (event: TypingEvent) => void;
  "chat:presence": (event: PresenceEvent) => void;
  "chat:read": (event: ReadEvent) => void;
  "chat:membership_revoked": (event: MembershipRemovedEvent) => void;
  "chat:group_changed": (event: { groupId: string }) => void;
  "chat:error": (error: ChatError) => void;
}
type ChatSocket = Socket<
  ClientEvents,
  ServerEvents,
  Record<string, never>,
  SocketState
>;
type ChatServer = Server<
  ClientEvents,
  ServerEvents,
  Record<string, never>,
  SocketState
>;

/** Comprueba el origen también en WebSocket, donde CORS de HTTP no protege el handshake. */
function originAllowed(origin?: string): boolean {
  const origins = (
    process.env.WEB_ORIGIN ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173,http://127.0.0.1:5173"
  )
    .split(",")
    .map((value) => value.trim());
  return !origin || origins.includes(origin);
}

/** Transporte Socket.IO: autentica, valida DTOs y delega la persistencia al servicio. */
@WebSocketGateway({
  maxHttpBufferSize: 32 * 1024,
  cors: {
    origin: (origin, callback) => callback(null, originAllowed(origin)),
    credentials: true,
  },
  allowRequest: (request, callback) =>
    callback(null, originAllowed(request.headers.origin)),
})
export class ChatGateway
  implements
    OnGatewayInit<ChatServer>,
    OnGatewayDisconnect<ChatSocket>,
    OnModuleDestroy
{
  @WebSocketServer() private server!: ChatServer;
  private readonly logger = new Logger(ChatGateway.name);
  private sweep?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly session: GroupSession,
    private readonly service: GroupMessagingService,
    private readonly presence: RoomPresence,
  ) {}

  /** Deniega la conexión antes de admitirla; no existe un usuario de demostración alternativo. */
  afterInit(server: ChatServer): void {
    server.use((socket, next) => {
      const authToken: unknown = socket.handshake.auth?.token;
      const token =
        typeof authToken === "string"
          ? authToken
          : extractToken(
              socket.handshake.headers.authorization,
              socket.handshake.headers.cookie,
            );
      this.session
        .validate(token)
        .then((user) => {
          socket.data = { token: token as string, user };
          next();
        })
        .catch(() =>
          next(
            new Error(
              "La sesión no está disponible. Inicia sesión nuevamente.",
            ),
          ),
        );
    });
    this.sweep = setInterval(() => {
      void this.sweepSessions();
    }, 10_000);
    this.sweep.unref();
  }

  /** Construye siempre el nombre de sala del servidor, sin aceptar nombres arbitrarios del cliente. */
  private room(groupId: string): string {
    return `room:group:${groupId}`;
  }

  /** Actualiza el agregado online después de conectar, salir o cerrar una pestaña. */
  private publishPresence(groupId: string): void {
    this.server
      .to(this.room(groupId))
      .emit("chat:presence", {
        groupId,
        userIds: this.presence.online(groupId),
      });
  }

  /** Libera presencia y escritura de una sola conexión sin desconectar el cliente global. */
  private async leave(socket: ChatSocket, groupId: string): Promise<void> {
    if (!socket.data.user) return;
    this.presence.leave(groupId, socket.data.user.id, socket.id);
    await socket.leave(this.room(groupId));
    this.server
      .to(this.room(groupId))
      .emit("chat:typing", {
        groupId,
        userId: socket.data.user.id,
        name: socket.data.user.name,
        isTyping: this.presence.isTyping(groupId, socket.data.user.id),
      });
    this.publishPresence(groupId);
  }

  /** Retira todas las salas de un socket cerrado y cancela sus eventos efímeros. */
  handleDisconnect(socket: ChatSocket): void {
    // Socket.IO vacía socket.rooms antes de disconnect; se conserva el registro en data.
    for (const groupId of this.socketGroups.get(socket.id) || [])
      void this.leave(socket, groupId);
    this.socketGroups.delete(socket.id);
  }
  private readonly socketGroups = new Map<string, Set<string>>();

  /** Elimina destinatarios que perdieron su sesión o membresía antes de difundir contenido privado. */
  private async pruneRoom(groupId: string): Promise<void> {
    const ids =
      this.server.sockets.adapter.rooms.get(this.room(groupId)) ||
      new Set<string>();
    for (const id of [...ids]) {
      const socket = this.server.sockets.sockets.get(id);
      if (!socket) continue;
      try {
        await this.session.validate(socket.data.token);
        await this.service.requireMember(groupId, socket.data.user.id);
      } catch {
        socket.emit("chat:membership_revoked", {
          groupId,
          userId: socket.data.user.id,
        });
        await this.leave(socket, groupId);
        this.socketGroups.get(id)?.delete(groupId);
      }
    }
  }

  /** Revoca conexiones inactivas aunque no envíen nuevos paquetes después de un logout. */
  private async sweepSessions(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      for (const socket of this.server.sockets.sockets.values()) {
        try {
          await this.session.validate(socket.data.token);
        } catch {
          socket.emit("chat:error", {
            code: "UNAUTHORIZED",
            message: "Tu sesión venció. Inicia sesión nuevamente.",
          });
          socket.disconnect(true);
        }
      }
      const groups = new Set(
        [...this.socketGroups.values()].flatMap((ids) => [...ids]),
      );
      for (const groupId of groups) await this.pruneRoom(groupId);
    } finally {
      this.sweeping = false;
    }
  }

  /** Valida el DTO y devuelve errores por ACK y chat:error sin filtrar detalles internos de SQL. */
  private async execute<T extends object, R extends object>(
    socket: ChatSocket,
    type: ClassConstructor<T>,
    raw: unknown,
    operation: (dto: T, user: ChatIdentity) => Promise<R>,
  ): Promise<WsAck<R>> {
    // Los handlers reciben unknown para que el ValidationPipe HTTP global no interrumpa el ACK.
    // Aquí siempre se transforma y valida la clase concreta antes de ejecutar la operación.
    try {
      const user = await this.session.validate(socket.data.token);
      socket.data.user = user;
      const budget = socket.data.budget;
      socket.data.budget =
        !budget || Date.now() - budget.since > 10_000
          ? { since: Date.now(), total: 1 }
          : { ...budget, total: budget.total + 1 };
      if (socket.data.budget.total > 60)
        throw new HttpException(
          "Estás enviando acciones muy rápido. Espera un momento.",
          429,
        );
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new BadRequestException("La solicitud del chat no es válida.");
      const dto = plainToInstance(type, raw);
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      });
      if (errors.length)
        throw new BadRequestException(
          errors
            .flatMap((error) => Object.values(error.constraints || {}))
            .join(". ") || "Revisa los datos enviados.",
        );
      return { success: true, ...(await operation(dto, user)) };
    } catch (cause) {
      const status = cause instanceof HttpException ? cause.getStatus() : 500;
      const error: ChatError = {
        code:
          status === 401
            ? "UNAUTHORIZED"
            : status === 403
              ? "FORBIDDEN"
              : status === 404
                ? "NOT_FOUND"
                : status === 409
                  ? "CONFLICT"
                  : status === 429
                    ? "RATE_LIMITED"
                    : status === 400
                      ? "VALIDATION"
                      : "INTERNAL",
        message:
          cause instanceof HttpException
            ? cause.message
            : "No se pudo completar la acción. Inténtalo nuevamente.",
      };
      if (status === 500)
        this.logger.error(
          "Falló una operación de chat; no se confirmó el envío.",
        );
      socket.emit("chat:error", error);
      if (status === 401) {
        const timer = setTimeout(() => socket.disconnect(true), 0);
        timer.unref();
      }
      return { success: false, error };
    }
  }

  /** Impide operar sobre una sala distinta de la que el usuario abrió y autorizó. */
  private requireRoom(socket: ChatSocket, groupId: string): void {
    if (!socket.rooms.has(this.room(groupId)))
      throw new ForbiddenException(
        "Abre la conversación antes de enviar acciones.",
      );
  }

  /** Autoriza primero la membresía y después incorpora el socket a la sala privada. */
  @SubscribeMessage("chat:join_room")
  joinRoom(@ConnectedSocket() socket: ChatSocket, @MessageBody() raw: unknown) {
    return this.execute(socket, WsJoinRoomDto, raw, async (dto, user) => {
      await this.service.requireMember(dto.groupId, user.id);
      await this.pruneRoom(dto.groupId);
      await socket.join(this.room(dto.groupId));
      this.presence.join(dto.groupId, user, socket.id);
      const groups = this.socketGroups.get(socket.id) || new Set<string>();
      groups.add(dto.groupId);
      this.socketGroups.set(socket.id, groups);
      this.publishPresence(dto.groupId);
      return {
        groupId: dto.groupId,
        userIds: this.presence.online(dto.groupId),
      };
    });
  }

  /** Solo abandona la sala solicitada; las demás funciones pueden seguir usando el socket global. */
  @SubscribeMessage("chat:leave_room")
  leaveRoom(
    @ConnectedSocket() socket: ChatSocket,
    @MessageBody() raw: unknown,
  ) {
    return this.execute(socket, WsJoinRoomDto, raw, async (dto) => {
      await this.leave(socket, dto.groupId);
      this.socketGroups.get(socket.id)?.delete(dto.groupId);
      return { groupId: dto.groupId };
    });
  }

  /** Confirma persistencia al emisor y difunde solo a otros sockets, sin mensajes fantasma. */
  @SubscribeMessage("chat:send_message")
  sendMessage(
    @ConnectedSocket() socket: ChatSocket,
    @MessageBody() raw: unknown,
  ) {
    return this.execute(socket, WsSendMessageDto, raw, async (dto, user) => {
      this.requireRoom(socket, dto.groupId);
      const result = await this.service.send(user.id, dto);
      await this.pruneRoom(dto.groupId);
      if (result.created)
        socket
          .to(this.room(dto.groupId))
          .emit("chat:new_message", result.message);
      return { message: result.message };
    });
  }

  /** Retransmite escritura efímera únicamente después de comprobar pertenencia vigente. */
  @SubscribeMessage("chat:typing")
  typing(@ConnectedSocket() socket: ChatSocket, @MessageBody() raw: unknown) {
    return this.execute(socket, WsTypingDto, raw, async (dto, user) => {
      this.requireRoom(socket, dto.groupId);
      await this.service.requireMember(dto.groupId, user.id);
      await this.pruneRoom(dto.groupId);
      this.presence.type(dto.groupId, user, socket.id, dto.isTyping, (event) =>
        this.server.to(this.room(dto.groupId)).emit("chat:typing", event),
      );
      return {};
    });
  }

  /** Comparte reacciones persistidas; la interfaz nunca incrementa un contador solo por recibir un clic. */
  private changeReaction(socket: ChatSocket, raw: unknown, add: boolean) {
    return this.execute(socket, WsReactionDto, raw, async (dto, user) => {
      this.requireRoom(socket, dto.groupId);
      const message = await this.service.reaction(user.id, dto, add);
      await this.pruneRoom(dto.groupId);
      socket.to(this.room(dto.groupId)).emit("chat:message_updated", message);
      return { message };
    });
  }
  /** Agrega una reacción propia con idempotencia en la base de datos. */
  @SubscribeMessage("reaction:add")
  addReaction(
    @ConnectedSocket() socket: ChatSocket,
    @MessageBody() raw: unknown,
  ) {
    return this.changeReaction(socket, raw, true);
  }
  /** Retira únicamente la reacción del usuario autenticado. */
  @SubscribeMessage("reaction:remove")
  removeReaction(
    @ConnectedSocket() socket: ChatSocket,
    @MessageBody() raw: unknown,
  ) {
    return this.changeReaction(socket, raw, false);
  }

  /** Notifica una lectura real que el cliente produce solo con la conversación visible. */
  @SubscribeMessage("message:read")
  markRead(@ConnectedSocket() socket: ChatSocket, @MessageBody() raw: unknown) {
    return this.execute(socket, WsReadMessageDto, raw, async (dto, user) => {
      this.requireRoom(socket, dto.groupId);
      const receipt = {
        ...(await this.service.read(user.id, dto)),
        name: user.name,
      };
      await this.pruneRoom(dto.groupId);
      socket.to(this.room(dto.groupId)).emit("chat:read", receipt);
      return { receipt };
    });
  }

  /** El servicio de grupos llama este evento tras confirmar una salida o expulsión. */
  @OnEvent("group.member_removed")
  async removeUser(event: MembershipRemovedEvent): Promise<void> {
    if (!this.server) return; // Un contexto de servicios sin transporte no tiene sockets que revocar.
    for (const socket of this.server.sockets.sockets.values()) {
      if (
        socket.data.user?.id === event.userId &&
        socket.rooms.has(this.room(event.groupId))
      ) {
        socket.emit("chat:membership_revoked", event);
        await this.leave(socket, event.groupId);
        this.socketGroups.get(socket.id)?.delete(event.groupId);
      }
    }
  }

  /** Puente de SPEC-06: solo anuncia ocultaciones que ya fueron guardadas por moderación. */
  @OnEvent("chat:message_hidden")
  async hidden(event: HiddenMessageEvent): Promise<void> {
    if (!this.server) return;
    const message = await this.service.message(event.groupId, event.messageId);
    if (message.status !== "hidden") return;
    await this.pruneRoom(event.groupId);
    this.server.to(this.room(event.groupId)).emit("chat:message_hidden", event);
  }

  /** Actualiza listas y permisos visibles después de aprobar solicitudes o transferir liderazgo. */
  @OnEvent("group.changed")
  async changed(event: { groupId: string }): Promise<void> {
    if (!this.server) return;
    await this.pruneRoom(event.groupId);
    this.server.to(this.room(event.groupId)).emit("chat:group_changed", event);
  }

  /** Libera recursos efímeros al detener NestJS. */
  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
    this.socketGroups.clear();
  }
}
