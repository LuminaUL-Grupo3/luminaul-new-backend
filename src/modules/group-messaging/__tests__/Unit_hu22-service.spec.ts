import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupMessagingService } from "../group-messaging.service";
import { GroupsRepository } from "../repositories/groups.repository";
import { MessagesRepository } from "../repositories/messages.repository";
import { GroupEventsClient } from "../client/GroupEventsClient";

/** PU-02: se ejecutan requests() y decide() reales; sus colaboradores están aislados. */
describe("PU-02 - GroupMessagingService (HU 2.2)", () => {
  const groupId = "10000000-0000-4000-8000-000000000001";
  const leaderId = "20000000-0000-4000-8000-000000000001";
  const applicantId = "30000000-0000-4000-8000-000000000001";
  const requestId = "40000000-0000-4000-8000-000000000001";
  const result = { applicantId, groupName: "Repaso de software" };
  const requests = vi.fn<GroupsRepository["requests"]>();
  const decide = vi.fn<GroupsRepository["decide"]>();
  const emitGroupChanged = vi.fn<GroupEventsClient["emitGroupChanged"]>();
  const notifyUser = vi.fn<GroupEventsClient["notifyUser"]>();
  let service: GroupMessagingService;

  beforeEach(() => {
    vi.resetAllMocks();
    requests.mockResolvedValue([]);
    decide.mockResolvedValue(result);
    service = new GroupMessagingService(
      { requests, decide } as unknown as GroupsRepository,
      {} as MessagesRepository,
      { emitGroupChanged, notifyUser } as unknown as GroupEventsClient,
    );
  });

  it("U01 requests consulta los grupos del usuario autenticado", async () => {
    const pending = [{ id: requestId, groupId, status: "pending" }];
    requests.mockResolvedValue(pending as Awaited<ReturnType<GroupsRepository["requests"]>>);
    await expect(service.requests(leaderId)).resolves.toBe(pending);
    expect(requests).toHaveBeenCalledExactlyOnceWith(leaderId, undefined);
  });

  it("U02 requests transmite el grupo específico sin sustituir al actor", async () => {
    await expect(service.requests(leaderId, groupId)).resolves.toEqual([]);
    expect(requests).toHaveBeenCalledExactlyOnceWith(leaderId, groupId);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("U03 requests propaga un error del repositorio", async () => {
    const failure = new ForbiddenException("Solo el líder puede revisar solicitudes.");
    requests.mockRejectedValue(failure);
    await expect(service.requests(leaderId, groupId)).rejects.toBe(failure);
    expect(emitGroupChanged).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it.each([
    ["U04", "approved", "Solicitud aceptada", "Solicitud aceptada correctamente."],
    ["U05", "rejected", "Solicitud rechazada", "Solicitud rechazada correctamente."],
  ] as const)("%s decide %s comunica el resultado al solicitante", async (_id, status, title, message) => {
    await expect(service.decide(groupId, requestId, leaderId, status)).resolves.toEqual({ message });
    expect(decide).toHaveBeenCalledExactlyOnceWith(groupId, requestId, leaderId, status);
    expect(emitGroupChanged).toHaveBeenCalledExactlyOnceWith(groupId);
    expect(notifyUser).toHaveBeenCalledExactlyOnceWith({
      userId: applicantId,
      title,
      message: expect.stringContaining(result.groupName),
      type: "GROUP",
    });
    expect(emitGroupChanged.mock.invocationCallOrder[0]).toBeLessThan(notifyUser.mock.invocationCallOrder[0]);
  });

  it("U06 decide propaga la denegación de permisos sin emitir eventos", async () => {
    const failure = new ForbiddenException("Solo el líder puede resolver solicitudes.");
    decide.mockRejectedValue(failure);
    await expect(service.decide(groupId, requestId, leaderId, "approved")).rejects.toBe(failure);
    expect(emitGroupChanged).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("U07 decide propaga un fallo de persistencia sin anunciar éxito", async () => {
    const failure = new Error("Fallo de persistencia simulado");
    decide.mockRejectedValue(failure);
    await expect(service.decide(groupId, requestId, leaderId, "rejected")).rejects.toBe(failure);
    expect(emitGroupChanged).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("U08 no notifica antes de que el repositorio confirme la decisión", async () => {
    let confirm!: (value: typeof result) => void;
    decide.mockReturnValue(new Promise((resolve) => { confirm = resolve; }));
    const pending = service.decide(groupId, requestId, leaderId, "approved");
    expect(emitGroupChanged).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
    confirm(result);
    await expect(pending).resolves.toEqual({ message: "Solicitud aceptada correctamente." });
    expect(emitGroupChanged).toHaveBeenCalledOnce();
    expect(notifyUser).toHaveBeenCalledOnce();
  });
});
