import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AuditLog, Coupon, GlintEvent, Notification, Season, SeasonSnapshot, StarCompletion, User, XpEvent } from "../src/models/index.js";
import { verifyAuditChain } from "../src/lib/audit.js";
import { checkIntegrity, sealAll } from "../src/lib/integrity.js";
import { createPythonStar, createUser, http, loginAs, sentMails, setRole } from "./helpers.js";
import type { RoleKey } from "../src/models/Role.js";

async function staff(role: RoleKey, email = `${role}@test.com`) {
  const user = await setRole(await createUser(email), role);
  return { user, agent: await loginAs(email) };
}

async function student(email: string, alias: string) {
  const user = await createUser(email);
  return user.update({ alias, name: `Nombre de ${alias}` });
}

async function xp(user: User, amount: number) {
  await XpEvent.create({ userId: user.id, xp: amount, reason: "question_correct", referenceId: randomUUID() });
}

const lastLog = async (action: string) => (await AuditLog.findOne({ where: { action }, order: [["id", "DESC"]] }))!;

const prize = (userIds: string[], extra: object = {}) => ({
  requestId: randomUUID(),
  board: "xp",
  userIds,
  glints: 100,
  reason: "Top 3 de la semana",
  notify: true,
  ...extra,
});

describe("permisos del ranking en el panel", () => {
  it("pide sesión y el permiso de cada cosa; el admin ve y premia pero no cierra", async () => {
    expect((await http().get("/admin/ranking")).status).toBe(401);
    await student("ana@test.com", "ana");
    const alumno = await loginAs("ana@test.com");
    expect((await alumno.get("/admin/ranking")).status).toBe(403);
    expect((await alumno.post("/admin/ranking/prizes").send({})).status).toBe(403);

    const { agent: teacher } = await staff("teacher");
    expect((await teacher.get("/admin/ranking")).status).toBe(403);

    const { agent: admin } = await staff("admin");
    expect((await admin.get("/admin/ranking")).status).toBe(200);
    expect((await admin.get("/admin/ranking/seasons")).status).toBe(200);
    expect((await admin.post("/admin/ranking/seasons/close").send({ seasonId: randomUUID(), name: "T2" })).status).toBe(403);

    const { agent: root } = await staff("super_admin");
    expect((await root.post("/admin/ranking/seasons/close").send({ seasonId: randomUUID(), name: "T2" })).status).toBe(409);
  });
});

describe("GET /admin/ranking", () => {
  it("trae nombre, email y alias, sin staff, y valida la tabla", async () => {
    const ana = await student("ana@test.com", "ana");
    const beto = await student("beto@test.com", "beto");
    const { user: admin, agent } = await staff("admin");
    await xp(ana, 50);
    await xp(beto, 80);
    await xp(admin, 999);

    const res = await agent.get("/admin/ranking?board=xp&period=all").expect(200);
    expect(res.body.students).toBe(2);
    expect(res.body.season.name).toBe("Temporada 1");
    expect(res.body.top).toEqual([
      expect.objectContaining({ userId: beto.id, position: 1, alias: "beto", name: "Nombre de beto", email: "beto@test.com", value: 80, prizeGlints: 0 }),
      expect.objectContaining({ userId: ana.id, position: 2, value: 50 }),
    ]);
    expect((await agent.get("/admin/ranking?board=otra")).status).toBe(400);
    expect((await agent.get("/admin/ranking?period=mes")).status).toBe(400);
  });
});

describe("premiar desde el ranking", () => {
  it("da destellos a cada uno, avisa, deja la bitácora y no suma a la tabla de destellos", async () => {
    const ana = await student("ana@test.com", "ana");
    const beto = await student("beto@test.com", "beto");
    const { agent } = await staff("admin");
    await sealAll(); // lo que crean los ayudantes queda sin sellar

    const body = prize([ana.id, beto.id]);
    const res = await agent.post("/admin/ranking/prizes").send(body).expect(201);
    expect(res.body).toMatchObject({ awarded: 2, glints: 100, coupons: [] });

    expect((await ana.reload()).glints).toBe(100);
    expect((await beto.reload()).glints).toBe(100);
    expect(await GlintEvent.count({ where: { reason: "ranking_prize", referenceId: body.requestId } })).toBe(2);
    expect(await AuditLog.count({ where: { action: "ranking.glints_award" } })).toBe(2);
    expect((await lastLog("ranking.glints_award")).after).toMatchObject({ glints: 100, board: "xp", reason: "Top 3 de la semana" });
    expect(await Notification.count({ where: { userId: ana.id, kind: "prize" } })).toBe(1);
    expect(sentMails().filter((m) => m.html.includes("Top 3 de la semana"))).toHaveLength(2);

    // Un premio no cuenta como "destellos conseguidos", pero el staff lo ve marcado
    const alumno = await loginAs("ana@test.com");
    expect((await alumno.get("/ranking?board=glints")).body.top).toEqual([]);
    const staffView = await agent.get("/admin/ranking?board=xp&period=all");
    expect(staffView.body.top).toEqual([]); // ni tienen XP

    expect((await verifyAuditChain()).brokenAt).toBeNull();
    expect((await checkIntegrity()).filter((p) => p.table === "users")).toEqual([]);
  });

  it("el mismo pedido no premia dos veces", async () => {
    const ana = await student("ana@test.com", "ana");
    const { agent } = await staff("admin");
    const body = prize([ana.id]);
    await agent.post("/admin/ranking/prizes").send(body).expect(201);
    expect((await agent.post("/admin/ranking/prizes").send(body)).status).toBe(409);
    expect((await ana.reload()).glints).toBe(100);
  });

  it("con cupón: lo emite como regalo con el motivo del ranking", async () => {
    const ana = await student("ana@test.com", "ana");
    const { agent } = await staff("admin");
    const res = await agent
      .post("/admin/ranking/prizes")
      .send(prize([ana.id], { glints: null, coupon: { percent: 20, validDays: 30 } }))
      .expect(201);
    expect(res.body.coupons).toHaveLength(1);
    const coupon = (await Coupon.findOne({ where: { userId: ana.id } }))!;
    expect(coupon).toMatchObject({ source: "manual", percent: 20 });
    expect((await lastLog("coupon.issue")).after).toMatchObject({ reason: "Ranking · Top 3 de la semana" });
    expect((await ana.reload()).glints).toBe(0);
    expect(sentMails().at(-1)!.html).toContain(coupon.code);
  });

  it("valida lo que llega", async () => {
    const ana = await student("ana@test.com", "ana");
    const { agent } = await staff("admin");
    const send = (extra: object) => agent.post("/admin/ranking/prizes").send(prize([ana.id], extra));
    expect((await send({ glints: 0 })).status).toBe(400);
    expect((await send({ glints: 5001 })).status).toBe(400);
    expect((await send({ glints: null })).status).toBe(400); // ningún premio
    expect((await send({ coupon: { percent: 61, validDays: 30 } })).status).toBe(400);
    expect((await send({ coupon: { percent: 10, validDays: 0 } })).status).toBe(400);
    expect((await send({ reason: "  " })).status).toBe(400);
    expect((await send({ userIds: [] })).status).toBe(400);
    expect((await send({ userIds: [ana.id, ana.id] })).status).toBe(400);
    expect((await send({ userIds: ["no-es-un-id"] })).status).toBe(400);
    expect((await send({ requestId: "x" })).status).toBe(400);
    expect((await send({ board: "otra" })).status).toBe(400);
  });

  it("si uno no se puede premiar (staff o de baja), no se premia a nadie", async () => {
    const ana = await student("ana@test.com", "ana");
    const { user: otro } = await staff("teacher");
    const { agent } = await staff("admin");
    expect((await agent.post("/admin/ranking/prizes").send(prize([ana.id, otro.id]))).status).toBe(409);
    expect((await ana.reload()).glints).toBe(0);
    expect(await GlintEvent.count()).toBe(0);
    expect(await AuditLog.count({ where: { action: "ranking.glints_award" } })).toBe(0);

    await ana.update({ deletedAt: new Date() });
    expect((await agent.post("/admin/ranking/prizes").send(prize([ana.id]))).status).toBe(409);
    expect((await agent.post("/admin/ranking/prizes").send(prize([randomUUID()]))).status).toBe(404);
  });

  it("revertir el premio saca los destellos si no los gastó, y si los gastó da 409", async () => {
    const ana = await student("ana@test.com", "ana");
    const { agent } = await staff("admin");
    const { user: root } = await staff("super_admin");
    await agent.post("/admin/ranking/prizes").send(prize([ana.id])).expect(201);
    const log = await lastLog("ranking.glints_award");
    expect(log.reversible).toBe(true);

    // El admin no tiene audit:revert: lo hace el super admin
    const rootAgent = await loginAs(root.email);
    await ana.update({ glints: 40 }); // gastó 60
    expect((await rootAgent.post(`/admin/audit/${log.id}/revert`).send({ confirm: true })).status).toBe(409);
    expect((await ana.reload()).glints).toBe(40);

    await ana.update({ glints: 130 }); // ganó más jugando
    await rootAgent.post(`/admin/audit/${log.id}/revert`).send({ confirm: true }).expect(200);
    expect((await ana.reload()).glints).toBe(30);
    expect(await GlintEvent.count({ where: { reason: "ranking_prize_undo" } })).toBe(1);
    expect((await lastLog("audit.revert")).revertsId).toBe(log.id);
    // Y no se revierte dos veces
    expect((await rootAgent.post(`/admin/audit/${log.id}/revert`).send({ confirm: true })).status).toBe(409);
  });
});

describe("cerrar la temporada", () => {
  it("guarda la foto, abre otra y las tablas cuentan desde cero sin borrar nada", async () => {
    const ana = await student("ana@test.com", "ana");
    const beto = await student("beto@test.com", "beto");
    const { star } = await createPythonStar();
    await xp(ana, 300);
    await xp(beto, 100);
    await StarCompletion.create({ userId: ana.id, starId: star.id });
    await ana.update({ bestStreak: 12 });
    const totalXpBefore = (await ana.reload()).totalXp;
    const { agent: root } = await staff("super_admin");
    const before = await root.get("/admin/ranking/seasons").expect(200);
    expect(before.body.current.name).toBe("Temporada 1");
    expect(before.body.past).toEqual([]);

    const res = await root
      .post("/admin/ranking/seasons/close")
      .send({ seasonId: before.body.current.id, name: "Temporada 2" })
      .expect(201);
    expect(res.body).toMatchObject({ closed: { name: "Temporada 1" }, next: { name: "Temporada 2" } });

    // Nada se borró
    expect((await ana.reload()).totalXp).toBe(totalXpBefore);
    expect(await XpEvent.count()).toBe(2);
    expect(await StarCompletion.count()).toBe(1);
    expect(await Season.count()).toBe(2);
    expect(await Season.count({ where: { endedAt: null } })).toBe(1);

    // La foto
    const xpTop = await SeasonSnapshot.findAll({ where: { board: "xp" }, order: [["position", "ASC"]] });
    expect(xpTop.map((r) => [r.alias, r.value, r.name])).toEqual([
      ["ana", 300, "Nombre de ana"],
      ["beto", 100, "Nombre de beto"],
    ]);
    const past = (await root.get("/admin/ranking/seasons")).body.past;
    expect(past).toHaveLength(1);
    expect(past[0].boards.stars).toEqual([{ position: 1, alias: "ana", name: "Nombre de ana", value: 1 }]);

    // El ranking: la temporada arranca vacía, "siempre" no cambia y las rachas no se reinician
    const alumno = await loginAs("ana@test.com");
    expect((await alumno.get("/ranking?board=xp&period=season")).body.top).toEqual([]);
    expect((await alumno.get("/ranking?board=xp&period=all")).body.top[0]).toMatchObject({ alias: "ana", value: 300 });
    expect((await alumno.get("/ranking?board=stars")).body).toMatchObject({ period: "season", top: [] });
    expect((await alumno.get("/ranking?board=stars&period=all")).body.top[0]).toMatchObject({ alias: "ana", value: 1 });
    expect((await alumno.get("/ranking?board=best_streak")).body.top[0]).toMatchObject({ alias: "ana", value: 12 });
    expect((await alumno.get("/ranking?board=xp")).body.season.name).toBe("Temporada 2");

    // Lo nuevo cuenta en la temporada nueva
    await xp(beto, 40);
    expect((await alumno.get("/ranking?board=xp&period=season")).body.top).toEqual([
      expect.objectContaining({ alias: "beto", value: 40 }),
    ]);

    const log = await lastLog("ranking.season_close");
    expect(log).toMatchObject({ reversible: false, targetType: "season" });
    expect(log.after).toMatchObject({ closed: "Temporada 1", next: "Temporada 2" });
    expect((await verifyAuditChain()).brokenAt).toBeNull();
  });

  it("no cierra una temporada que ya se cerró, ni sin nombre, ni con un id que no es", async () => {
    const { agent: root } = await staff("super_admin");
    const { current } = (await root.get("/admin/ranking/seasons")).body;
    expect((await root.post("/admin/ranking/seasons/close").send({ seasonId: current.id, name: "  " })).status).toBe(400);
    expect((await root.post("/admin/ranking/seasons/close").send({ seasonId: "x", name: "T2" })).status).toBe(400);
    await root.post("/admin/ranking/seasons/close").send({ seasonId: current.id, name: "T2" }).expect(201);
    // El mismo id otra vez (por ejemplo, un doble clic o dos pantallas abiertas)
    expect((await root.post("/admin/ranking/seasons/close").send({ seasonId: current.id, name: "T3" })).status).toBe(409);
    expect(await Season.count()).toBe(2);
  });

  it("la base no deja dos temporadas abiertas", async () => {
    await expect(Season.create({ name: "Otra", startedAt: new Date() })).rejects.toThrow();
  });

  it("los premios de una temporada se ven marcados en esa temporada", async () => {
    const ana = await student("ana@test.com", "ana");
    await xp(ana, 10);
    const { agent } = await staff("admin");
    await agent.post("/admin/ranking/prizes").send(prize([ana.id])).expect(201);
    const top = (await agent.get("/admin/ranking?board=xp&period=all")).body.top;
    expect(top[0]).toMatchObject({ alias: "ana", prizeGlints: 100 });
  });
});
