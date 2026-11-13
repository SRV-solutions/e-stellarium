import { describe, expect, it } from "vitest";
import { sequelize } from "../src/db.js";
import { AuditLog } from "../src/models/index.js";
import { verifyAuditChain } from "../src/lib/audit.js";
import { can } from "../src/lib/permissions.js";
import { changeUserRole } from "../src/admin/users.js";
import type { RoleKey } from "../src/models/Role.js";
import { createUser, loginAs, setRole } from "./helpers.js";

async function superAdmin() {
  const user = await setRole(await createUser("super@test.com"), "super_admin");
  return { user, agent: await loginAs("super@test.com") };
}

async function lastLog(action: string) {
  return (await AuditLog.findOne({ where: { action }, order: [["id", "DESC"]] }))!;
}

describe("POST /admin/audit/:id/revert", () => {
  it("pide audit:revert y un registro que exista", async () => {
    await setRole(await createUser("admin@test.com"), "admin");
    const admin = await loginAs("admin@test.com");
    expect((await admin.post("/admin/audit/1/revert")).status).toBe(403);

    const { agent } = await superAdmin();
    expect((await agent.post("/admin/audit/abc/revert")).status).toBe(404);
    expect((await agent.post("/admin/audit/999/revert")).status).toBe(404);
  });

  it("revierte un cambio de rol con un registro nuevo enlazado, una sola vez", async () => {
    const { user: me, agent } = await superAdmin();
    const student = await createUser("alumno@test.com");
    await agent.patch(`/admin/users/${student.id}/role`).send({ role: "admin" }).expect(200);
    const original = await lastLog("user.role_update");

    const res = await agent.post(`/admin/audit/${original.id}/revert`);
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ id: student.id, role: "student" });

    const revert = await AuditLog.findByPk(res.body.revertId);
    expect(revert).toMatchObject({
      action: "audit.revert",
      actorId: me.id,
      revertsId: original.id,
      reversible: false,
      before: { role: "admin" },
      after: { role: "student" },
    });

    const entries = (await agent.get("/admin/audit")).body.entries;
    const listed = entries.find((e: { id: number }) => e.id === original.id);
    expect(listed).toMatchObject({ revertedBy: revert!.id, canRevert: false });

    const again = await agent.post(`/admin/audit/${original.id}/revert`);
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/ya se revirtió/);
    // Una reversión tampoco se revierte
    expect((await agent.post(`/admin/audit/${revert!.id}/revert`)).status).toBe(409);
    expect((await verifyAuditChain()).brokenAt).toBeNull();
  });

  it("revierte los permisos de un rol", async () => {
    const { agent } = await superAdmin();
    const teacher = await setRole(await createUser("docente@test.com"), "teacher");
    await agent.patch("/admin/roles/teacher").send({ permissions: ["coupons:manage"] }).expect(200);

    const res = await agent.post(`/admin/audit/${(await lastLog("role.update")).id}/revert`);
    expect(res.status).toBe(200);
    expect(res.body.result.permissions).toEqual(["content:edit", "students:view"]);
    expect(await can(teacher, "coupons:manage")).toBe(false);
    expect(await can(teacher, "content:edit")).toBe(true);
  });

  it("revierte una baja (restaura) y una restauración (vuelve a dar de baja)", async () => {
    const { agent } = await superAdmin();
    const student = await createUser("alumno@test.com");
    await agent.delete(`/admin/users/${student.id}`).expect(200);

    const restored = await agent.post(`/admin/audit/${(await lastLog("user.delete")).id}/revert`);
    expect(restored.status).toBe(200);
    expect(restored.body.result.deletedAt).toBeNull();
    await loginAs("alumno@test.com");

    await agent.delete(`/admin/users/${student.id}`).expect(200);
    await agent.post(`/admin/users/${student.id}/restore`).expect(200);
    const deleted = await agent.post(`/admin/audit/${(await lastLog("user.restore")).id}/revert`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.result.deletedAt).not.toBeNull();
  });

  it("no revierte lo que no es reversible", async () => {
    const { agent } = await superAdmin();
    const res = await agent.post(`/admin/audit/${(await lastLog("auth.login")).id}/revert`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Ese registro no se puede revertir.");
  });

  it("si lo cambiaron después, muestra los tres valores y pide confirmar", async () => {
    const { agent } = await superAdmin();
    const student = await createUser("alumno@test.com");
    await agent.patch(`/admin/users/${student.id}/role`).send({ role: "teacher" }).expect(200);
    const first = await lastLog("user.role_update");
    await agent.patch(`/admin/users/${student.id}/role`).send({ role: "admin" }).expect(200);

    const res = await agent.post(`/admin/audit/${first.id}/revert`);
    expect(res.status).toBe(409);
    expect(res.body.conflict).toEqual({
      before: { role: "student" },
      recorded: { role: "teacher" },
      current: { role: "admin" },
    });
    expect(await AuditLog.count({ where: { action: "audit.revert" } })).toBe(0);

    const confirmed = await agent.post(`/admin/audit/${first.id}/revert`).send({ confirm: true });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.result.role).toBe("student");
  });

  it("si ya está como antes, no hay nada que revertir", async () => {
    const { agent } = await superAdmin();
    const student = await createUser("alumno@test.com");
    await agent.patch(`/admin/users/${student.id}/role`).send({ role: "teacher" }).expect(200);
    const first = await lastLog("user.role_update");
    await agent.patch(`/admin/users/${student.id}/role`).send({ role: "student" }).expect(200);

    const res = await agent.post(`/admin/audit/${first.id}/revert`).send({ confirm: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/nada que revertir/);
  });

  it("pasa por las mismas protecciones: nadie revierte un cambio de su propio rol", async () => {
    const admin = await setRole(await createUser("super@test.com"), "admin");
    await setRole(await createUser("otro@test.com"), "super_admin");
    // Un script lo hizo super admin; revertirlo sería cambiar su propio rol
    await sequelize.transaction((t) => changeUserRole(t, { actorId: null, ip: null }, admin.id, "super_admin" as RoleKey));
    const agent = await loginAs("super@test.com");

    const res = await agent.post(`/admin/audit/${(await lastLog("user.role_update")).id}/revert`);
    expect(res.status).toBe(403);
  });
});
