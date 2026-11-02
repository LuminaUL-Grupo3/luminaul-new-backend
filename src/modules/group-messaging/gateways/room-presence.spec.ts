import { RoomPresence } from "./room-presence";
import { ChatIdentity, TypingEvent } from "../types/messaging.types";

/** Pruebas de recursos efímeros que no deben guardarse en PostgreSQL. */
describe("SPEC-04 presencia y escritura", () => {
  const user: ChatIdentity = {
    id: "student",
    name: "Estudiante",
    expiresAt: Date.now() + 60_000,
  };
  let registry: RoomPresence;
  beforeEach(() => {
    jest.useFakeTimers();
    registry = new RoomPresence();
  });
  afterEach(() => {
    registry.onModuleDestroy();
    jest.useRealTimers();
  });

  it("mantiene online al usuario hasta que cierre su última pestaña", () => {
    registry.join("group", user, "tab-1");
    registry.join("group", user, "tab-2");
    registry.leave("group", user.id, "tab-1");
    expect(registry.online("group")).toEqual([user.id]);
    registry.leave("group", user.id, "tab-2");
    expect(registry.online("group")).toEqual([]);
  });

  it("la caducidad de una pestaña no cancela la escritura de otra pestaña activa", () => {
    const events: TypingEvent[] = [],
      notify = (event: TypingEvent) => events.push(event);
    registry.join("group", user, "tab-1");
    registry.join("group", user, "tab-2");
    registry.type("group", user, "tab-1", true, notify);
    jest.advanceTimersByTime(2000);
    registry.type("group", user, "tab-2", true, notify);
    jest.advanceTimersByTime(2501);
    expect(registry.isTyping("group", user.id)).toBe(true);
    expect(events.map((event) => event.isTyping)).toEqual([true]);
    jest.advanceTimersByTime(2000);
    expect(registry.isTyping("group", user.id)).toBe(false);
    expect(events.map((event) => event.isTyping)).toEqual([true, false]);
  });

  it("no mezcla presencia entre grupos y libera temporizadores al cerrar NestJS", () => {
    registry.join("group-a", user, "tab-1");
    registry.type("group-a", user, "tab-1", true, () => {});
    expect(registry.online("group-b")).toEqual([]);
    registry.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
    expect(registry.online("group-a")).toEqual([]);
  });
});
