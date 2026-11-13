import { describe, it, expect, vi } from "vitest";
import { DataSource, EntityManager } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { GroupsRepository } from "../repositories/groups.repository";
import { GroupMessagingService } from "../group-messaging.service";
import { MessagesRepository } from "../repositories/messages.repository";

interface Scenario {
  noGroup?: boolean;
  noRequest?: boolean;
  requestStatus?: string;
  unavailable?: boolean;
  memberStatus?: string;
  count?: number;
  capacity?: number;
  failInsert?: boolean;
}
const groupId = "10000000-0000-4000-8000-000000000001",
  leaderId = "20000000-0000-4000-8000-000000000001";
const applicantId = "30000000-0000-4000-8000-000000000001",
  requestId = "40000000-0000-4000-8000-000000000001";

/** Sustituye solo las consultas; lock, requireCapacity y decide ejecutan su implementación real. */
function fixture(scenario: Scenario = {}) {
  const query = vi.fn(
    async (sql: string, _parameters?: unknown[]): Promise<unknown[]> => {
      if (sql.startsWith("SELECT id,name,leader_id"))
        return scenario.noGroup
          ? []
          : [
              {
                id: groupId,
                name: "Grupo de software",
                leaderId,
                maxCapacity: scenario.capacity ?? 3,
              },
            ];
      if (sql.startsWith("SELECT user_id"))
        return scenario.noRequest
          ? []
          : [
              {
                userId: applicantId,
                status: scenario.requestStatus ?? "pending",
              },
            ];
      if (sql.startsWith("SELECT id FROM users"))
        return scenario.unavailable ? [] : [{ id: applicantId }];
      if (sql.startsWith("SELECT status FROM group_members"))
        return scenario.memberStatus ? [{ status: scenario.memberStatus }] : [];
      if (sql.startsWith("SELECT COUNT"))
        return [{ count: scenario.count ?? 1 }];
      if (sql.startsWith("INSERT INTO group_members") && scenario.failInsert)
        throw new Error("Fallo de escritura simulado");
      return [];
    },
  );
  const manager = { query } as unknown as EntityManager;
  const transaction = vi.fn(
    async (action: (manager: EntityManager) => Promise<unknown>) =>
      action(manager),
  );
  const repository = new GroupsRepository({
    transaction,
  } as unknown as DataSource);
  const emit = vi.fn();
  const service = new GroupMessagingService(
    repository,
    {} as MessagesRepository,
    { emit } as unknown as EventEmitter2,
  );
  return { repository, service, query, emit, transaction };
}
/** Identifica las escrituras solicitadas sin afirmar que un doble prueba el rollback de PostgreSQL. */
function writes(context: ReturnType<typeof fixture>, prefix: string) {
  return context.query.mock.calls.filter(([sql]) => sql.startsWith(prefix));
}

describe("HU 2.2 caja blanca y unitarias de decide", () => {
  it("P7 aprueba e incorpora al alumno antes de resolver la solicitud", async () => {
    const f = fixture();
    await expect(
      f.repository.decide(groupId, requestId, leaderId, "approved"),
    ).resolves.toEqual({ applicantId, groupName: "Grupo de software" });
    expect(writes(f, "INSERT INTO group_members")).toHaveLength(1);
    expect(writes(f, "UPDATE join_requests")[0][1]).toEqual([
      requestId,
      groupId,
      "approved",
      leaderId,
    ]);
    expect(f.transaction).toHaveBeenCalledTimes(1);
  });
  it("P4 rechaza sin incorporar ni comprobar capacidad", async () => {
    const f = fixture({ count: 3 });
    await f.repository.decide(groupId, requestId, leaderId, "rejected");
    expect(writes(f, "INSERT INTO group_members")).toHaveLength(0);
    expect(writes(f, "SELECT COUNT")).toHaveLength(0);
    expect(writes(f, "UPDATE join_requests")[0][1]?.[2]).toBe("rejected");
  });
  it("P1 impide decidir a un usuario que no es líder", async () => {
    const f = fixture();
    await expect(
      f.repository.decide(groupId, requestId, applicantId, "approved"),
    ).rejects.toMatchObject({ status: 403 });
    expect(writes(f, "UPDATE join_requests")).toHaveLength(0);
  });
  it("P2 rechaza una solicitud que no existe en el grupo", async () => {
    const f = fixture({ noRequest: true });
    await expect(
      f.repository.decide(groupId, requestId, leaderId, "approved"),
    ).rejects.toMatchObject({ status: 404 });
  });
  it.each(["approved", "rejected"])(
    "P3 no procesa otra vez una solicitud %s",
    async (requestStatus) => {
      const f = fixture({ requestStatus });
      await expect(
        f.repository.decide(groupId, requestId, leaderId, "approved"),
      ).rejects.toMatchObject({ status: 409 });
      expect(writes(f, "INSERT INTO group_members")).toHaveLength(0);
    },
  );
  it("P5 no incorpora una cuenta suspendida, eliminada o no verificada", async () => {
    const f = fixture({ unavailable: true });
    await expect(
      f.repository.decide(groupId, requestId, leaderId, "approved"),
    ).rejects.toThrow("La cuenta solicitante no está disponible.");
  });
  it("P6 impide duplicar una membresía activa", async () => {
    const f = fixture({ memberStatus: "active" });
    await expect(
      f.repository.decide(groupId, requestId, leaderId, "approved"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("permite ocupar exactamente el último cupo", async () => {
    const f = fixture({ count: 2, capacity: 3 });
    await f.repository.decide(groupId, requestId, leaderId, "approved");
    expect(writes(f, "INSERT INTO group_members")).toHaveLength(1);
  });
  it.each([3, 4])(
    "no supera la capacidad cuando ya existen %i miembros",
    async (count) => {
      const f = fixture({ count, capacity: 3 });
      await expect(
        f.repository.decide(groupId, requestId, leaderId, "approved"),
      ).rejects.toThrow("El grupo alcanzó su capacidad máxima.");
      expect(writes(f, "UPDATE join_requests")).toHaveLength(0);
    },
  );
  it.each(["left", "kicked"])(
    "reactiva una membresía histórica %s mediante upsert",
    async (memberStatus) => {
      const f = fixture({ memberStatus });
      await f.repository.decide(groupId, requestId, leaderId, "approved");
      expect(writes(f, "INSERT INTO group_members")[0][0]).toContain(
        "ON CONFLICT(group_id,user_id)",
      );
      expect(writes(f, "INSERT INTO group_members")[0][0]).toContain(
        "left_at=NULL",
      );
    },
  );
  it("rechaza un grupo inexistente antes de consultar la solicitud", async () => {
    const f = fixture({ noGroup: true });
    await expect(
      f.repository.decide(groupId, requestId, leaderId, "approved"),
    ).rejects.toMatchObject({ status: 404 });
    expect(writes(f, "SELECT user_id")).toHaveLength(0);
  });
  it("propaga una falla de escritura y no intenta resolver la solicitud", async () => {
    const f = fixture({ failInsert: true });
    await expect(
      f.repository.decide(groupId, requestId, leaderId, "approved"),
    ).rejects.toThrow("Fallo de escritura simulado");
    expect(writes(f, "UPDATE join_requests")).toHaveLength(0);
  });
  it.each(["approved", "rejected"] as const)(
    "notifica personalmente al solicitante después de %s",
    async (status) => {
      const f = fixture();
      await f.service.decide(groupId, requestId, leaderId, status);
      expect(f.emit).toHaveBeenCalledWith("group.changed", { groupId });
      expect(f.emit).toHaveBeenCalledWith(
        "notification.send",
        expect.objectContaining({
          userId: applicantId,
          type: "GROUP",
          title:
            status === "approved"
              ? "Solicitud aceptada"
              : "Solicitud rechazada",
        }),
      );
      expect(f.emit.mock.calls[1][1].message).toContain("Grupo de software");
      expect(f.query.mock.invocationCallOrder.at(-1)).toBeLessThan(
        f.emit.mock.invocationCallOrder[0],
      );
    },
  );
  it("no emite eventos ni notificaciones cuando falla la decisión", async () => {
    const f = fixture({ requestStatus: "approved" });
    await expect(
      f.service.decide(groupId, requestId, leaderId, "approved"),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.emit).not.toHaveBeenCalled();
  });
});
