import { describe, expect, it } from "vitest";
import { QueryTypes } from "sequelize";
import { sequelize } from "../src/db.js";
import { AuditLog, Coupon, User } from "../src/models/index.js";
import { checkIntegrity, runDailyCheckIfDue, runIntegrityCheck, sealAll } from "../src/lib/integrity.js";
import {
  PASSWORD,
  createPythonStar,
  createQuestion,
  createUser,
  enrolledStudent,
  http,
  loginAs,
  provision,
  sentMails,
  setRole,
  tokenFromLastMail,
} from "./helpers.js";

// Cambia una fila "a mano", como alguien con acceso a la base: sin pasar por la API (y sin que el trigger
// la anote, para que nadie la selle)
async function tamper(sql: string) {
  await sequelize.transaction(async (t) => {
    await sequelize.query("SELECT set_config('integrity.sealing', 'on', true)", { transaction: t });
    await sequelize.query(sql, { transaction: t });
  });
}

describe("sellado de las tablas protegidas", () => {
  it("todo lo que escribe la API queda sellado: alta, respuestas, tienda, cupones, contraseña y staff", async () => {
    // Alta por el Apps Script y contraseña desde el link
    await provision({ email: "nuevo@test.com", name: "Nuevo", paymentId: "1", courses: ["python"] }).expect(201);
    await http().post("/auth/password/set").send({ token: tokenFromLastMail(), password: PASSWORD }).expect(200);

    // Responder bien una estrella: xp_events nuevo y users actualizado
    const { product, star } = await createPythonStar();
    const question = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    const agent = await enrolledStudent();
    await sealAll(); // lo que crearon los ayudantes de los tests no pasó por la API
    const options = (await agent.get(`/stars/${star.id}`)).body.questions[0].content.options as string[];
    await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: options.indexOf("4") } }).expect(200);

    // Comprar un cupón con destellos y canjearlo
    await sequelize.transaction((t) => User.update({ glints: 500 }, { where: {}, transaction: t }));
    await agent.post("/shop/purchases").send({ item: "coupon_10" }).expect(201);
    const coupon = await Coupon.findOne();
    await http()
      .post("/coupons/redeem")
      .set("x-api-key", process.env.INTERNAL_API_KEY!)
      .send({ code: coupon!.code })
      .expect(200);

    // Staff: rol, permisos, baja, restauración y una reversión
    await setRole(await createUser("super@test.com"), "super_admin");
    await sealAll();
    const staff = await loginAs("super@test.com");
    const student = await User.findOne({ where: { email: "alumno@test.com" } });
    await staff.patch(`/admin/users/${student!.id}/role`).send({ role: "teacher" }).expect(200);
    await staff.patch("/admin/roles/teacher").send({ permissions: ["coupons:manage"] }).expect(200);
    await staff.delete(`/admin/users/${student!.id}`).expect(200);
    await staff.post(`/admin/users/${student!.id}/restore`).expect(200);
    const roleChange = await AuditLog.findOne({ where: { action: "role.update" } });
    await staff.post(`/admin/audit/${roleChange!.id}/revert`).expect(200);

    expect(await checkIntegrity()).toEqual([]);
    const pending = await sequelize.query("SELECT 1 FROM integrity_pending", { type: QueryTypes.SELECT });
    expect(pending).toHaveLength(0);
  });

  it("una escritura fuera de una transacción queda sin sellar, y la verificación la muestra", async () => {
    const user = await createUser(); // User.create sin transacción
    expect(await checkIntegrity()).toEqual([{ kind: "row", table: "users", rowId: user.id }]);
  });
});

describe("detección de cambios hechos a mano", () => {
  async function sealedStudent() {
    const user = await createUser();
    await sealAll();
    expect(await checkIntegrity()).toEqual([]);
    return user;
  }

  it("una fila modificada: falla su DVH", async () => {
    const user = await sealedStudent();
    await tamper(`UPDATE users SET total_xp = 99999 WHERE id = '${user.id}'`);
    expect(await checkIntegrity()).toEqual([{ kind: "row", table: "users", rowId: user.id }]);
  });

  it("alguien que se pone de super admin: falla su DVH", async () => {
    const user = await sealedStudent();
    await tamper(`UPDATE users SET role_id = 4 WHERE id = '${user.id}'`);
    expect(await checkIntegrity()).toEqual([{ kind: "row", table: "users", rowId: user.id }]);
  });

  it("una fila borrada: falla el DVV", async () => {
    const user = await sealedStudent();
    await createUser("otro@test.com");
    await sealAll();
    await tamper(`DELETE FROM users WHERE id = '${user.id}'`);
    expect(await checkIntegrity()).toEqual([{ kind: "table", table: "users" }]);
  });

  it("un permiso agregado a un rol: la fila nueva no tiene un DVH válido", async () => {
    await sealedStudent();
    await tamper("INSERT INTO role_permissions (role_id, permission_key) VALUES (1, 'roles:manage')");
    const problems = await checkIntegrity();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ kind: "row", table: "role_permissions" });
  });

  it("la API no 'lava' una fila adulterada al volver a escribirla", async () => {
    const user = await sealedStudent();
    await tamper(`UPDATE users SET glints = 99999 WHERE id = '${user.id}'`);
    const agent = await loginAs("alumno@test.com");
    await agent.put("/me/cosmetics").send({ kind: "title", id: null, variant: 1 }).expect(200);
    expect(await checkIntegrity()).toContainEqual({ kind: "row", table: "users", rowId: user.id });
  });

  it("el último registro de la bitácora borrado: falla el DVV de la bitácora", async () => {
    await setRole(await createUser("super@test.com"), "super_admin");
    await sealAll();
    await loginAs("super@test.com"); // queda un auth.login
    expect(await checkIntegrity()).toEqual([]);

    await sequelize.query("ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only");
    try {
      await sequelize.query("DELETE FROM audit_logs");
    } finally {
      await sequelize.query("ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only");
    }
    expect(await checkIntegrity()).toEqual([{ kind: "table", table: "audit_logs" }]);
  });
});

describe("GET /admin/integrity y POST /admin/integrity/check", () => {
  it("piden integrity:view", async () => {
    await setRole(await createUser("admin@test.com"), "admin");
    const agent = await loginAs("admin@test.com");
    expect((await agent.get("/admin/integrity")).status).toBe(403);
    expect((await agent.post("/admin/integrity/check")).status).toBe(403);
  });

  it("corre la verificación y guarda el resultado", async () => {
    await setRole(await createUser("super@test.com"), "super_admin");
    await sealAll();
    const agent = await loginAs("super@test.com");
    expect((await agent.get("/admin/integrity")).body.check).toBeNull();

    const res = await agent.post("/admin/integrity/check");
    expect(res.status).toBe(200);
    expect(res.body.check).toMatchObject({ source: "manual", ok: true, problemCount: 0, problems: [] });
    expect((await agent.get("/admin/integrity")).body.check.id).toBe(res.body.check.id);
  });

  it("si falla: lo registra en la bitácora y avisa por mail a los super admins", async () => {
    const me = await setRole(await createUser("super@test.com"), "super_admin");
    await setRole(await createUser("otro@test.com"), "super_admin");
    await sealAll();
    const agent = await loginAs("super@test.com");
    await tamper(`UPDATE users SET total_xp = 5 WHERE id = '${me.id}'`);

    const { body } = await agent.post("/admin/integrity/check").expect(200);
    expect(body.check).toMatchObject({ ok: false, problemCount: 1 });
    expect(body.check.problems).toEqual([{ kind: "row", table: "users", rowId: me.id }]);

    const log = await AuditLog.findOne({ where: { action: "integrity.fail" } });
    expect(log).toMatchObject({ actorId: me.id, targetId: String(body.check.id), reversible: false });
    expect(sentMails().map((m) => m.to).sort()).toEqual(["otro@test.com", "super@test.com"]);
    expect(sentMails()[0].subject).toMatch(/integridad/);
  });
});

describe("verificación diaria", () => {
  it("corre una sola vez por día de Argentina", async () => {
    const day = new Date("2026-11-20T15:00:00Z");
    expect(await runIntegrityCheck("daily", undefined, day)).toMatchObject({ source: "daily", ok: true });
    // Otra instancia de la API el mismo día: no la repite
    expect(await runIntegrityCheck("daily", undefined, new Date("2026-11-20T20:00:00Z"))).toBeNull();
    expect(await runIntegrityCheck("daily", undefined, new Date("2026-11-21T15:00:00Z"))).not.toBeNull();
  });

  it("runDailyCheckIfDue no hace esperar al pedido", async () => {
    runDailyCheckIfDue(new Date("2026-12-01T15:00:00Z"));
    runDailyCheckIfDue(new Date("2026-12-01T16:00:00Z")); // el mismo día: no hace nada
    await new Promise((resolve) => setTimeout(resolve, 500));
    const rows = await sequelize.query("SELECT 1 FROM integrity_checks WHERE source = 'daily'", {
      type: QueryTypes.SELECT,
    });
    expect(rows).toHaveLength(1);
  });
});
