import "reflect-metadata";
import { randomUUID, randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { hash } from "bcryptjs";
import { DataSource } from "typeorm";
import { configureHttpApp } from "../../../config/http-app.config";

const databaseUrl = process.env.TEST_HU22_DATABASE_URL;
/** Las pruebas de integración son optativas y solo admiten una base local dedicada a HU 2.2. */
describe.skipIf(!databaseUrl)("HU 2.2 contrato HTTP y PostgreSQL real", () => {
  let app: INestApplication, db: DataSource, base: string;
  const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const groups: string[] = [];
  const tokens: string[] = [];
  const password = "Hu22Pruebas!2026";

  /** Ejecuta el contrato público sin saltarse autenticación, DTOs ni reglas de negocio. */
  async function api<T = Record<string, unknown>>(
    path: string,
    token?: string,
    method = "GET",
    body?: unknown,
  ): Promise<{ status: number; body: T }> {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: (await response.json()) as T };
  }
  /** Crea precondiciones independientes; nunca reutiliza ni elimina grupos del usuario. */
  async function pending(applicant = users[1], capacity = 3, groupId?: string) {
    const id = groupId || randomUUID(),
      requestId = randomUUID();
    if (!groupId) {
      await db.query(
        "INSERT INTO groups(id,name,course_code,leader_id,max_capacity) VALUES($1,$2,$3,$4,$5)",
        [id, "HU22 " + id.slice(0, 8), "ISW2", users[0], capacity],
      );
      await db.query(
        "INSERT INTO group_members(group_id,user_id,role,status) VALUES($1,$2,'leader','active')",
        [id, users[0]],
      );
      groups.push(id);
    }
    await db.query(
      "INSERT INTO join_requests(id,group_id,user_id,message,status) VALUES($1,$2,$3,'Quiero participar en el repaso','pending')",
      [requestId, id, applicant],
    );
    return {
      groupId: id,
      requestId,
      path: `/groups/${id}/join-requests/${requestId}`,
    };
  }
  /** Lee el estado persistido para distinguir el mensaje de éxito de los cambios reales. */
  async function state(groupId: string, requestId: string) {
    const rows: { status: string; members: number }[] = await db.query(
      "SELECT j.status,(SELECT COUNT(*)::int FROM group_members m WHERE m.group_id=j.group_id AND m.status='active') AS members FROM join_requests j WHERE j.id=$1 AND j.group_id=$2",
      [requestId, groupId],
    );
    return rows[0];
  }
  beforeAll(async () => {
    const target = new URL(databaseUrl!);
    if (
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      !/^\/luminaul_spec04_hu22_test(?:_\d+)?$/.test(target.pathname)
    )
      throw Error(
        "Solo se admite una base PostgreSQL local exclusiva de las pruebas HU22.",
      );
    Object.assign(process.env, {
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: "false",
      JWT_SECRET: randomBytes(48).toString("hex"),
      MAIL_TRANSPORT: "console",
    });
    delete process.env.OPENAI_API_KEY;
    const { AppModule } = await import("../../../app.module");
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttpApp(app);
    await app.listen(0, "127.0.0.1");
    base = (await app.getUrl()) + "/api";
    db = app.get(DataSource);
    const passwordHash = await hash(password, 10);
    for (let i = 0; i < users.length; i++) {
      const email = `hu22.${users[i]}@aloe.ulima.edu.pe`;
      await db.query(
        "INSERT INTO users(id,email,name,password_hash,role,status,is_verified,tokens_valid_after) VALUES($1,$2,$3,$4,'student','active',true,NOW()-INTERVAL '1 minute')",
        [users[i], email, `Alumno HU22 ${i}`, passwordHash],
      );
      await db.query("INSERT INTO profiles(user_id,name) VALUES($1,$2)", [
        users[i],
        `Alumno HU22 ${i}`,
      ]);
      const response = await api<{ accessToken: string }>(
        "/auth/login",
        undefined,
        "POST",
        { email, password },
      );
      expect(response.status).toBe(200);
      expect(typeof response.body.accessToken).toBe("string");
      tokens.push(response.body.accessToken);
    }
  }, 60000);
  afterAll(async () => {
    if (db?.isInitialized) {
      if (groups.length)
        await db.query("DELETE FROM groups WHERE id=ANY($1::uuid[])", [groups]);
      await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
    }
    if (app) await app.close();
  });
  it("CN01 devuelve lista vacía al líder sin pendientes", async () => {
    const result = await api<unknown[]>("/groups/pending-requests", tokens[0]);
    expect(result.status).toBe(200);
    expect(result.body).toEqual([]);
  });
  it("CN02 consulta solo las solicitudes de grupos liderados por la sesión", async () => {
    const one = await pending(),
      two = await pending(users[2]);
    const own = await api<{ id: string }[]>(
      "/groups/pending-requests",
      tokens[0],
    );
    expect(own.body.map((r) => r.id)).toEqual(
      expect.arrayContaining([one.requestId, two.requestId]),
    );
    const other = await api<unknown[]>("/groups/pending-requests", tokens[3]);
    expect(other.body).toEqual([]);
  });
  it.each(["approved", "rejected"] as const)(
    "CN03/CN04 resuelve %s y entrega una notificación personal",
    async (status) => {
      const item = await pending();
      const result = await api(item.path, tokens[0], "PATCH", { status });
      expect(result.status).toBe(200);
      expect(await state(item.groupId, item.requestId)).toEqual({
        status,
        members: status === "approved" ? 2 : 1,
      });
      const list = await api<{ id: string }[]>(
        "/groups/pending-requests",
        tokens[0],
      );
      expect(list.body.some((r) => r.id === item.requestId)).toBe(false);
      await expect
        .poll(
          async () => {
            const notifications = await api<
              { message: string; type: string }[]
            >("/notifications/me", tokens[1]);
            return notifications.body.some(
              (n) =>
                n.type === "GROUP" &&
                n.message.includes(item.groupId.slice(0, 8)) &&
                n.message.includes(
                  status === "approved" ? "aceptada" : "rechazada",
                ),
            );
          },
          { timeout: 5000 },
        )
        .toBe(true);
    },
  );
  it("CN05 deniega a quien no lidera el grupo", async () => {
    const item = await pending();
    expect(
      (await api(item.path, tokens[3], "PATCH", { status: "approved" })).status,
    ).toBe(403);
    expect(await state(item.groupId, item.requestId)).toEqual({
      status: "pending",
      members: 1,
    });
  });
  it("CN06 responde 404 para una solicitud inexistente", async () => {
    const item = await pending();
    expect(
      (
        await api(
          `/groups/${item.groupId}/join-requests/${randomUUID()}`,
          tokens[0],
          "PATCH",
          { status: "approved" },
        )
      ).status,
    ).toBe(404);
  });
  it("CN07 no procesa otra vez una solicitud resuelta", async () => {
    const item = await pending();
    await api(item.path, tokens[0], "PATCH", { status: "approved" });
    expect(
      (await api(item.path, tokens[0], "PATCH", { status: "approved" })).status,
    ).toBe(409);
    expect((await state(item.groupId, item.requestId)).members).toBe(2);
  });
  it("CN08 rechaza el ingreso al alcanzar la capacidad máxima", async () => {
    const item = await pending(users[1], 1);
    expect(
      (await api(item.path, tokens[0], "PATCH", { status: "approved" })).status,
    ).toBe(409);
    expect(await state(item.groupId, item.requestId)).toEqual({
      status: "pending",
      members: 1,
    });
  });
  it.each([{ status: "accepted" }, { status: "approved", userId: users[0] }])(
    "CN09 rechaza un contrato inválido %j",
    async (body) => {
      const item = await pending();
      expect((await api(item.path, tokens[0], "PATCH", body)).status).toBe(400);
      expect((await state(item.groupId, item.requestId)).status).toBe(
        "pending",
      );
    },
  );
  it("CN10 exige sesión y valida UUID antes de modificar datos", async () => {
    const item = await pending();
    expect(
      (await api(item.path, undefined, "PATCH", { status: "approved" })).status,
    ).toBe(401);
    expect(
      (
        await api(
          `/groups/no-uuid/join-requests/${item.requestId}`,
          tokens[0],
          "PATCH",
          { status: "approved" },
        )
      ).status,
    ).toBe(400);
  });
  it("CN11 dos aprobaciones concurrentes no ocupan el mismo último cupo", async () => {
    const first = await pending(users[1], 2),
      second = await pending(users[2], 2, first.groupId);
    const results = await Promise.all([
      api(first.path, tokens[0], "PATCH", { status: "approved" }),
      api(second.path, tokens[0], "PATCH", { status: "approved" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const rows: { members: number; approved: number }[] = await db.query(
      "SELECT (SELECT COUNT(*)::int FROM group_members WHERE group_id=$1 AND status='active') AS members,(SELECT COUNT(*)::int FROM join_requests WHERE group_id=$1 AND status='approved') AS approved",
      [first.groupId],
    );
    expect(rows[0]).toEqual({ members: 2, approved: 1 });
  });
  it("CN12 un fallo real al resolver revierte la incorporación del alumno", async () => {
    const item = await pending(),
      name = "hu22_rollback_" + randomBytes(6).toString("hex");
    // El trigger existe únicamente en la base dedicada y únicamente falla para esta solicitud.
    await db.query(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo HU22 de prueba'; END; $$`,
    );
    await db.query(
      `CREATE TRIGGER ${name} BEFORE UPDATE ON join_requests FOR EACH ROW WHEN (OLD.id='${item.requestId}'::uuid) EXECUTE FUNCTION ${name}()`,
    );
    try {
      expect(
        (await api(item.path, tokens[0], "PATCH", { status: "approved" }))
          .status,
      ).toBe(500);
      expect(await state(item.groupId, item.requestId)).toEqual({
        status: "pending",
        members: 1,
      });
    } finally {
      await db.query(`DROP TRIGGER ${name} ON join_requests`);
      await db.query(`DROP FUNCTION ${name}()`);
    }
  });
});
