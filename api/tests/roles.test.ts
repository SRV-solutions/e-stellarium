import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { QueryTypes } from "sequelize";
import { sequelize } from "../src/db.js";
import { Enrollment, XpEvent } from "../src/models/index.js";
import { PERMISSIONS, can, permissionsOf } from "../src/lib/permissions.js";
import { requirePermission } from "../src/middlewares/requirePermission.js";
import type { User } from "../src/models/User.js";
import { createUser, http, loginAs, provision, sentMails, setRole, tokenFromLastMail } from "./helpers.js";

describe("roles y permisos", () => {
  it("la tabla permissions tiene los mismos permisos que el código", async () => {
    const rows = await sequelize.query<{ key: string }>("SELECT key FROM permissions ORDER BY key", {
      type: QueryTypes.SELECT,
    });
    expect(rows.map((r) => r.key)).toEqual([...PERMISSIONS].sort());
  });

  it("arma la matriz inicial: el alumno no tiene permisos y el super admin los tiene todos", async () => {
    const user = await createUser();
    expect(await permissionsOf(user)).toEqual([]);

    await setRole(user, "teacher");
    expect((await permissionsOf(user)).sort()).toEqual(["content:edit", "students:view"]);

    await setRole(user, "admin");
    expect(await can(user, "coupons:manage")).toBe(true);
    expect(await can(user, "roles:manage")).toBe(false);
    expect(await can(user, "audit:view")).toBe(false);

    await setRole(user, "super_admin");
    expect(await permissionsOf(user)).toEqual([...PERMISSIONS]);
  });

  it("GET /me trae el rol y los permisos", async () => {
    await setRole(await createUser(), "admin");
    const agent = await loginAs("alumno@test.com");
    const { body } = await agent.get("/me").expect(200);
    expect(body.user.role).toBe("admin");
    expect(body.user.permissions).toContain("economy:edit");
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("requirePermission responde 403 sin el permiso", async () => {
    const user = await createUser();
    let current: User = user;
    const app = express();
    app.get(
      "/x",
      (req, _res, next) => {
        req.user = current;
        next();
      },
      requirePermission("audit:view"),
      (_req, res) => {
        res.json({ ok: true });
      }
    );

    expect((await request(app).get("/x")).status).toBe(403);
    current = await setRole(user, "super_admin");
    expect((await request(app).get("/x")).body).toEqual({ ok: true });
  });
});

describe("baja lógica", () => {
  const softDelete = (user: User) => user.update({ deletedAt: new Date() });

  it("un usuario dado de baja no puede entrar, ni con la cookie que ya tenía", async () => {
    const user = await createUser();
    const agent = await loginAs("alumno@test.com");
    await softDelete(user);

    expect((await agent.get("/me")).status).toBe(401);
    const login = await http().post("/auth/login").send({ email: "alumno@test.com", password: "Prueba1234" });
    expect(login.status).toBe(401);
    expect(login.body.error).toBe("Email o contraseña incorrectos.");
  });

  it("no recibe el mail de recuperación ni puede usar un link que ya tenía", async () => {
    const user = await createUser();
    await http().post("/auth/password/forgot").send({ email: "alumno@test.com" }).expect(200);
    const token = tokenFromLastMail();
    await softDelete(user);

    const again = await http().post("/auth/password/forgot").send({ email: "alumno@test.com" });
    expect(again.status).toBe(200);
    expect(sentMails()).toHaveLength(1);
    const set = await http().post("/auth/password/set").send({ token, password: "OtraClave123" });
    expect(set.status).toBe(400);
  });

  it("desaparece del ranking", async () => {
    const gone = await createUser("baja@test.com");
    await XpEvent.create({ userId: gone.id, xp: 50, reason: "question_correct", referenceId: randomUUID() });
    await createUser("yo@test.com");
    const agent = await loginAs("yo@test.com");
    expect((await agent.get("/ranking?period=all")).body.top).toHaveLength(1);

    await softDelete(gone);
    expect((await agent.get("/ranking?period=all")).body.top).toHaveLength(0);
  });

  it("/provision le da el curso pero no lo restaura ni le manda mail", async () => {
    const user = await createUser();
    await softDelete(user);

    const res = await provision({ email: "alumno@test.com", name: "Alumno", paymentId: "777", courses: ["python"] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ status: "deleted_user", courses: ["python"], emailSent: false });
    expect(await Enrollment.count({ where: { userId: user.id } })).toBe(1);
    expect(sentMails()).toHaveLength(0);
    await user.reload();
    expect(user.deletedAt).not.toBeNull();
  });
});
