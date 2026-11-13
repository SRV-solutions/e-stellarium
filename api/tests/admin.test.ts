import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sequelize } from "../src/db.js";
import { verifyAuditChain } from "../src/lib/audit.js";
import { can } from "../src/lib/permissions.js";
import { changeUserRole, deleteUser } from "../src/admin/users.js";
import { AuditLog, User } from "../src/models/index.js";
import type { RoleKey } from "../src/models/Role.js";
import { createUser, http, loginAs, setRole } from "./helpers.js";

async function staff(email: string, role: RoleKey) {
  const user = await setRole(await createUser(email), role);
  return { user, agent: await loginAs(email) };
}

describe("GET /admin/roles", () => {
  it("pide sesión y el permiso roles:manage", async () => {
    expect((await http().get("/admin/roles")).status).toBe(401);
    const { agent } = await staff("admin@test.com", "admin");
    expect((await agent.get("/admin/roles")).status).toBe(403);
  });

  it("muestra los cuatro roles; el super admin tiene todo y no se edita", async () => {
    const { agent } = await staff("super@test.com", "super_admin");
    const { body } = await agent.get("/admin/roles").expect(200);
    expect(body.roles.map((r: { key: string }) => r.key)).toEqual(["student", "teacher", "admin", "super_admin"]);
    const superRole = body.roles.find((r: { key: string }) => r.key === "super_admin");
    expect(superRole.editable).toBe(false);
    expect(superRole.permissions).toHaveLength(11);
    expect(body.roles[0].permissions).toEqual([]);
  });
});

describe("PATCH /admin/roles/:key", () => {
  it("reemplaza los permisos del rol y lo registra en la bitácora", async () => {
    const { user, agent } = await staff("super@test.com", "super_admin");
    const teacher = await setRole(await createUser("docente@test.com"), "teacher");

    const res = await agent.patch("/admin/roles/teacher").send({ permissions: ["students:view", "content:approve"] });
    expect(res.status).toBe(200);
    // En el orden de la lista de permisos, sin importar cómo vinieron
    expect(res.body.role.permissions).toEqual(["content:approve", "students:view"]);
    expect(await can(teacher, "content:approve")).toBe(true);
    expect(await can(teacher, "content:edit")).toBe(false);

    const log = await AuditLog.findOne({ where: { action: "role.update" } });
    expect(log).toMatchObject({
      actorId: user.id,
      targetType: "role",
      targetId: "teacher",
      before: { permissions: ["content:edit", "students:view"] },
      after: { permissions: ["content:approve", "students:view"] },
      reversible: true,
    });
  });

  it("si la lista es la misma no registra nada", async () => {
    const { agent } = await staff("super@test.com", "super_admin");
    await agent.patch("/admin/roles/teacher").send({ permissions: ["content:edit", "students:view"] }).expect(200);
    expect(await AuditLog.count({ where: { action: "role.update" } })).toBe(0);
  });

  it("rechaza permisos desconocidos, el rol super admin y roles que no existen", async () => {
    const { agent } = await staff("super@test.com", "super_admin");
    expect((await agent.patch("/admin/roles/admin").send({ permissions: ["todo"] })).status).toBe(400);
    expect((await agent.patch("/admin/roles/admin").send({ permissions: "todo" })).status).toBe(400);
    expect((await agent.patch("/admin/roles/super_admin").send({ permissions: [] })).status).toBe(403);
    expect((await agent.patch("/admin/roles/rey").send({ permissions: [] })).status).toBe(404);
  });
});

describe("PATCH /admin/users/:id/role", () => {
  it("cambia el rol y lo registra", async () => {
    const { user: me, agent } = await staff("super@test.com", "super_admin");
    const student = await createUser("alumno@test.com");

    const res = await agent.patch(`/admin/users/${student.id}/role`).send({ role: "teacher" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: student.id, role: "teacher", deletedAt: null });

    const log = await AuditLog.findOne({ where: { action: "user.role_update" } });
    expect(log).toMatchObject({
      actorId: me.id,
      targetId: student.id,
      before: { role: "student" },
      after: { role: "teacher" },
    });
  });

  it("nadie cambia su propio rol, y valida el id y el rol", async () => {
    const { user: me, agent } = await staff("super@test.com", "super_admin");
    const student = await createUser("alumno@test.com");
    expect((await agent.patch(`/admin/users/${me.id}/role`).send({ role: "admin" })).status).toBe(403);
    expect((await agent.patch("/admin/users/123/role").send({ role: "admin" })).status).toBe(404);
    expect((await agent.patch(`/admin/users/${randomUUID()}/role`).send({ role: "admin" })).status).toBe(404);
    expect((await agent.patch(`/admin/users/${student.id}/role`).send({ role: "rey" })).status).toBe(400);
    expect((await agent.patch(`/admin/users/${student.id}/role`).send({})).status).toBe(400);
  });

  it("no le saca el rol al último super admin", async () => {
    const only = await setRole(await createUser("super@test.com"), "super_admin");
    const attempt = sequelize.transaction((t) => changeUserRole(t, { actorId: null, ip: null }, only.id, "admin"));
    await expect(attempt).rejects.toMatchObject({ status: 409 });

    // Con otro super admin activo, sí
    await setRole(await createUser("otro@test.com"), "super_admin");
    await sequelize.transaction((t) => changeUserRole(t, { actorId: null, ip: null }, only.id, "admin"));
    expect((await only.reload()).roleId).toBe(3);
  });
});

describe("baja y restauración", () => {
  it("da de baja sin borrar la fila, y restaura", async () => {
    const { agent } = await staff("super@test.com", "super_admin");
    const student = await createUser("alumno@test.com");

    const del = await agent.delete(`/admin/users/${student.id}`);
    expect(del.status).toBe(200);
    expect(del.body.user.deletedAt).not.toBeNull();
    expect(await User.count({ where: { id: student.id } })).toBe(1);
    expect((await http().post("/auth/login").send({ email: "alumno@test.com", password: "Prueba1234" })).status).toBe(401);
    expect((await agent.delete(`/admin/users/${student.id}`)).status).toBe(409);

    const restore = await agent.post(`/admin/users/${student.id}/restore`);
    expect(restore.status).toBe(200);
    expect(restore.body.user.deletedAt).toBeNull();
    await loginAs("alumno@test.com");
    expect((await agent.post(`/admin/users/${student.id}/restore`)).status).toBe(409);

    const actions = (await AuditLog.findAll({ order: [["id", "ASC"]] })).map((l) => l.action);
    expect(actions).toEqual(["auth.login", "user.delete", "user.restore"]);
  });

  it("nadie se da de baja a sí mismo ni da de baja al último super admin", async () => {
    const { user: me, agent } = await staff("super@test.com", "super_admin");
    expect((await agent.delete(`/admin/users/${me.id}`)).status).toBe(403);

    const other = await setRole(await createUser("otro@test.com"), "super_admin");
    await agent.delete(`/admin/users/${other.id}`).expect(200);
    // Ahora "me" es el único: dado de baja por un script, tampoco
    const attempt = sequelize.transaction((t) => deleteUser(t, { actorId: null, ip: null }, me.id));
    await expect(attempt).rejects.toMatchObject({ status: 409 });
  });

  it("pide el permiso roles:manage", async () => {
    const { agent } = await staff("admin@test.com", "admin");
    const student = await createUser("alumno@test.com");
    expect((await agent.delete(`/admin/users/${student.id}`)).status).toBe(403);
    expect((await agent.post(`/admin/users/${student.id}/restore`)).status).toBe(403);
    expect((await agent.patch(`/admin/users/${student.id}/role`).send({ role: "admin" })).status).toBe(403);
  });
});

describe("inicio de sesión del staff", () => {
  it("queda en la bitácora; el de un alumno no", async () => {
    await createUser("alumno@test.com");
    await loginAs("alumno@test.com");
    expect(await AuditLog.count()).toBe(0);

    const { user } = await staff("docente@test.com", "teacher");
    const log = await AuditLog.findOne({ where: { action: "auth.login" } });
    expect(log).toMatchObject({ actorId: user.id, targetId: user.id, reversible: false });
    expect(log!.ip).toBeTruthy();
  });
});

describe("GET /admin/audit", () => {
  it("pide audit:view", async () => {
    const { agent } = await staff("admin@test.com", "admin");
    expect((await agent.get("/admin/audit")).status).toBe(403);
  });

  it("lista del más nuevo al más viejo, con filtros y quién lo hizo", async () => {
    const { user: me, agent } = await staff("super@test.com", "super_admin");
    const student = await createUser("alumno@test.com");
    await agent.patch(`/admin/users/${student.id}/role`).send({ role: "teacher" }).expect(200);
    await agent.delete(`/admin/users/${student.id}`).expect(200);

    const all = (await agent.get("/admin/audit").expect(200)).body;
    expect(all.entries.map((e: { action: string }) => e.action)).toEqual(["user.delete", "user.role_update", "auth.login"]);
    expect(all.entries[0]).toMatchObject({
      actor: { id: me.id, name: me.name, email: "super@test.com" },
      target: { type: "user", id: student.id },
      canRevert: true,
      revertedBy: null,
    });
    expect(all.entries[0]).not.toHaveProperty("hash");
    expect(all.nextBefore).toBeNull();

    const byAction = (await agent.get("/admin/audit?action=user.delete")).body.entries;
    expect(byAction).toHaveLength(1);
    const byTarget = (await agent.get(`/admin/audit?targetType=user&targetId=${student.id}`)).body.entries;
    expect(byTarget).toHaveLength(2);
    const older = (await agent.get(`/admin/audit?before=${all.entries[0].id}`)).body.entries;
    expect(older).toHaveLength(2);
    const otherActor = (await agent.get(`/admin/audit?actor=${student.id}`)).body.entries;
    expect(otherActor).toHaveLength(0);
  });

  it("filtra por días de Argentina y valida los filtros", async () => {
    const { agent } = await staff("super@test.com", "super_admin");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
    expect((await agent.get(`/admin/audit?from=${today}&to=${today}`)).body.entries).toHaveLength(1);
    expect((await agent.get("/admin/audit?to=2020-01-01")).body.entries).toHaveLength(0);

    expect((await agent.get("/admin/audit?from=ayer")).status).toBe(400);
    expect((await agent.get("/admin/audit?actor=123")).status).toBe(400);
    expect((await agent.get("/admin/audit?before=-1")).status).toBe(400);
  });
});

describe("la cadena de hashes", () => {
  it("queda entera después de varios cambios", async () => {
    const { agent } = await staff("super@test.com", "super_admin");
    const student = await createUser("alumno@test.com");
    await agent.patch(`/admin/users/${student.id}/role`).send({ role: "admin" }).expect(200);
    await agent.patch("/admin/roles/admin").send({ permissions: ["content:edit"] }).expect(200);
    await agent.delete(`/admin/users/${student.id}`).expect(200);

    const result = await verifyAuditChain();
    expect(result).toMatchObject({ count: 4, brokenAt: null });
  });

  it("la base no deja editar ni borrar registros", async () => {
    await staff("super@test.com", "super_admin");
    await expect(sequelize.query("UPDATE audit_logs SET ip = '1.2.3.4'")).rejects.toThrow(/no se edita/);
    await expect(sequelize.query("DELETE FROM audit_logs")).rejects.toThrow(/no se edita/);
  });

  it("si alguien la modifica a mano (sacando el trigger), se rompe en ese registro", async () => {
    const { agent } = await staff("super@test.com", "super_admin");
    const student = await createUser("alumno@test.com");
    await agent.patch(`/admin/users/${student.id}/role`).send({ role: "admin" }).expect(200);
    await agent.delete(`/admin/users/${student.id}`).expect(200);
    const logs = await AuditLog.findAll({ order: [["id", "ASC"]] });

    await sequelize.query("ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only");
    try {
      await sequelize.query(`UPDATE audit_logs SET after = '{"role":"super_admin"}' WHERE id = ${logs[1].id}`);
      expect((await verifyAuditChain()).brokenAt).toBe(logs[1].id);

      // Borrar un registro del medio rompe el siguiente
      await sequelize.query(`DELETE FROM audit_logs WHERE id = ${logs[1].id}`);
      expect((await verifyAuditChain()).brokenAt).toBe(logs[2].id);
    } finally {
      await sequelize.query("ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only");
    }
  });
});
