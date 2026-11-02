import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ChatIdentity, TypingEvent } from "../types/messaging.types";

interface RoomUser {
  name: string;
  sockets: Set<string>;
  typing: Set<string>;
}

/** Registro efímero por sala y pestaña: cerrar una conexión no desconecta al mismo usuario en otra. */
@Injectable()
export class RoomPresence implements OnModuleDestroy {
  private readonly rooms = new Map<string, Map<string, RoomUser>>();
  private readonly typingTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  /** Registra una conexión ya autenticada y autorizada para la sala. */
  join(groupId: string, user: ChatIdentity, socketId: string): void {
    const room = this.rooms.get(groupId) || new Map<string, RoomUser>();
    const member = room.get(user.id) || {
      name: user.name,
      sockets: new Set<string>(),
      typing: new Set<string>(),
    };
    member.name = user.name;
    member.sockets.add(socketId);
    room.set(user.id, member);
    this.rooms.set(groupId, room);
  }

  /** Retira exclusivamente esta pestaña y devuelve las salas que requieren actualizar presencia. */
  leave(groupId: string, userId: string, socketId: string): void {
    const key = `${groupId}:${socketId}`,
      timer = this.typingTimers.get(key);
    if (timer) clearTimeout(timer);
    this.typingTimers.delete(key);
    const room = this.rooms.get(groupId),
      member = room?.get(userId);
    member?.sockets.delete(socketId);
    member?.typing.delete(socketId);
    if (!member?.sockets.size) room?.delete(userId);
    if (!room?.size) this.rooms.delete(groupId);
  }

  /** Devuelve usuarios únicos, no la cantidad de sockets o pestañas. */
  online(groupId: string): string[] {
    return [...(this.rooms.get(groupId)?.keys() || [])].sort();
  }

  /** Consulta el estado agregado de escritura de todas las pestañas del usuario. */
  isTyping(groupId: string, userId: string): boolean {
    return Boolean(this.rooms.get(groupId)?.get(userId)?.typing.size);
  }

  /** Caduca la escritura aunque un navegador se cierre sin enviar isTyping=false. */
  type(
    groupId: string,
    user: ChatIdentity,
    socketId: string,
    isTyping: boolean,
    notify: (event: TypingEvent) => void,
  ): void {
    const member = this.rooms.get(groupId)?.get(user.id);
    if (!member) return;
    const previous = member.typing.size > 0,
      key = `${groupId}:${socketId}`;
    const timer = this.typingTimers.get(key);
    if (timer) clearTimeout(timer);
    this.typingTimers.delete(key);
    if (isTyping) {
      member.typing.add(socketId);
      const expiry = setTimeout(
        () => this.type(groupId, user, socketId, false, notify),
        4500,
      );
      expiry.unref();
      this.typingTimers.set(key, expiry);
    } else member.typing.delete(socketId);
    const current = member.typing.size > 0;
    if (current !== previous)
      notify({
        groupId,
        userId: user.id,
        name: member.name,
        isTyping: current,
      });
  }

  /** Cancela todos los temporizadores al detener la aplicación o terminar una prueba. */
  onModuleDestroy(): void {
    for (const timer of this.typingTimers.values()) clearTimeout(timer);
    this.typingTimers.clear();
    this.rooms.clear();
  }
}
