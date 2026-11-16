import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { sequelize } from "../src/db.js";
import { AuditLog, Challenge, Coupon, CouponVoid, Setting } from "../src/models/index.js";
import { verifyAuditChain } from "../src/lib/audit.js";
import { checkIntegrity } from "../src/lib/integrity.js";
import { challengeSettingsProblem, challengeWindow, latestSlot, nextSlot, recipeOf, scheduleOf } from "../src/games/challenge.js";
import { loadSettings } from "../src/games/economy.js";
import { createUser, loginAs, sentMails, setRole } from "./helpers.js";

async function staff(role: "teacher" | "admin" | "super_admin", email = `${role}@test.com`) {
  const user = await setRole(await createUser(email), role);
  return { user, agent: await loginAs(email) };
}

async function lastLog(action: string) {
  return (await AuditLog.findOne({ where: { action }, order: [["id", "DESC"]] }))!;
}

const key = () => process.env.INTERNAL_API_KEY!;
const gift = { email: "sofia@test.com", percent: 25, validDays: 30, reason: "Beca del concurso", notify: true };

describe("Cupones del panel", () => {
  it("emite un cupón de regalo, le avisa por mail y queda en la bitácora", async () => {
    const sofia = await createUser("sofia@test.com");
    const { agent } = await staff("admin");

    const lookup = await agent.get("/admin/coupons/lookup?email=SOFIA@test.com").expect(200);
    expect(lookup.body).toMatchObject({ user: { id: sofia.id, deleted: false }, validDays: 60, maxPercent: 60 });

    const res = await agent.post("/admin/coupons").send(gift).expect(201);
    expect(res.body.coupon.code).toMatch(/^ESTL-RG-[2-9A-Z]{6}$/);
    expect(res.body.emailSent).toBe(true);
    expect(sentMails().at(-1)!.html).toContain(res.body.coupon.code);

    const coupon = (await Coupon.findByPk(res.body.coupon.id))!;
    expect(coupon).toMatchObject({ source: "manual", percent: 25, userId: sofia.id });
    const days = (coupon.expiresAt.getTime() - coupon.createdAt.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    expect((await lastLog("coupon.issue")).after).toMatchObject({ reason: "Beca del concurso", percent: 25 });

    // En la lista, con el motivo
    const list = await agent.get("/admin/coupons").expect(200);
    expect(list.body.coupons[0]).toMatchObject({ code: coupon.code, status: "live", reason: "Beca del concurso", source: "manual" });
    expect(list.body.counts).toMatchObject({ live: 1, all: 1 });
    expect((await checkIntegrity()).filter((p) => p.table === "coupons")).toEqual([]);
  });

  it("valida lo que llega y pide coupons:manage", async () => {
    await createUser("sofia@test.com");
    const { agent } = await staff("admin");
    expect((await agent.post("/admin/coupons").send({ ...gift, percent: 61 })).status).toBe(400);
    expect((await agent.post("/admin/coupons").send({ ...gift, validDays: 0 })).status).toBe(400);
    expect((await agent.post("/admin/coupons").send({ ...gift, reason: "  " })).status).toBe(400);
    expect((await agent.post("/admin/coupons").send({ ...gift, email: "nadie@test.com" })).status).toBe(404);

    const { agent: teacher } = await staff("teacher");
    expect((await teacher.get("/admin/coupons")).status).toBe(403);
    expect((await teacher.post("/admin/coupons").send(gift)).status).toBe(403);
  });

  it("anula un cupón: wearesrv.com lo rechaza, el alumno lo ve anulado y se revierte desde la bitácora", async () => {
    const sofia = await createUser("sofia@test.com");
    const { agent } = await staff("super_admin");
    const { body } = await agent.post("/admin/coupons").send({ ...gift, notify: false }).expect(201);
    const { id, code } = body.coupon;

    expect((await agent.delete(`/admin/coupons/${id}`).send({})).status).toBe(400); // sin motivo
    await agent.delete(`/admin/coupons/${id}`).send({ reason: "Error al emitirlo" }).expect(200);
    expect((await agent.delete(`/admin/coupons/${id}`).send({ reason: "otra vez" })).status).toBe(409);

    const check = await request(app).post("/coupons/validate").set("x-api-key", key()).send({ code });
    expect(check.body).toEqual({ valid: false, reason: "voided" });
    const redeem = await request(app).post("/coupons/redeem").set("x-api-key", key()).send({ code });
    expect(redeem.status).toBe(409);
    const mine = await (await loginAs(sofia.email)).get("/coupons").expect(200);
    expect(mine.body.coupons[0].voided).toBe(true);

    const list = await agent.get("/admin/coupons?status=void").expect(200);
    expect(list.body.coupons[0].void).toMatchObject({ reason: "Error al emitirlo" });
    expect((await checkIntegrity()).filter((p) => p.table === "coupon_voids")).toEqual([]);

    // Revertir la anulación: vuelve a servir
    const log = await lastLog("coupon.void");
    await agent.post(`/admin/audit/${log.id}/revert`).send({}).expect(200);
    expect(await CouponVoid.count()).toBe(0);
    const again = await request(app).post("/coupons/validate").set("x-api-key", key()).send({ code });
    expect(again.body.valid).toBe(true);
    expect((await checkIntegrity()).filter((p) => p.table === "coupon_voids")).toEqual([]);
    expect((await verifyAuditChain()).brokenAt).toBeNull();
  });

  it("no anula uno usado, y revertir la emisión lo anula solo si no se usó", async () => {
    await createUser("sofia@test.com");
    const { agent } = await staff("super_admin");
    const first = (await agent.post("/admin/coupons").send({ ...gift, notify: false })).body.coupon;
    const second = (await agent.post("/admin/coupons").send({ ...gift, notify: false })).body.coupon;
    const [, secondLog] = await AuditLog.findAll({ where: { action: "coupon.issue" }, order: [["id", "ASC"]] });

    await request(app).post("/coupons/redeem").set("x-api-key", key()).send({ code: first.code }).expect(200);
    expect((await agent.delete(`/admin/coupons/${first.id}`).send({ reason: "x" })).status).toBe(409);
    const firstLog = await AuditLog.findOne({ where: { action: "coupon.issue", targetId: first.id } });
    expect((await agent.post(`/admin/audit/${firstLog!.id}/revert`).send({})).status).toBe(409);

    await agent.post(`/admin/audit/${secondLog!.id}/revert`).send({}).expect(200);
    expect(await CouponVoid.count({ where: { couponId: second.id } })).toBe(1);
  });
});

describe("Desafíos del panel", () => {
  it("el horario y la receta salen de settings", async () => {
    const s = await loadSettings();
    expect(scheduleOf(s)).toEqual({ weekdays: [1, 6], hour: 9 });
    expect(recipeOf(s)).toEqual({
      own: { difficulties: ["easy", "easy", "medium", "medium", "hard", "hard"], review: 2 },
      explore: ["easy", "easy", "medium"],
      discover: ["easy"],
    });
    expect(challengeSettingsProblem(s)).toBeNull();
    // Miércoles a las 22: sale a la 01:00 UTC del jueves
    const schedule = { weekdays: [3], hour: 22 };
    expect(nextSlot(new Date("2026-11-16T12:00:00Z"), schedule)).toEqual(new Date("2026-11-19T01:00:00Z"));
    expect(latestSlot(new Date("2026-11-20T12:00:00Z"), schedule)).toEqual(new Date("2026-11-19T01:00:00Z"));
  });

  it("cambiar solo la hora no deja un desafío de una hora", () => {
    // El anterior cerró el lunes 16 a las 9; ahora sale lunes y sábados a las 10. El de transición
    // arranca el lunes a las 9 y dura hasta el sábado a las 10 (no hasta el lunes a las 10)
    const window = challengeWindow(new Date("2026-11-16T12:30:00Z"), { weekdays: [1, 6], hour: 10 }, new Date("2026-11-16T12:00:00Z"));
    expect(window).toEqual({ publishedAt: new Date("2026-11-16T12:00:00Z"), closesAt: new Date("2026-11-21T13:00:00Z") });
    // Sin cambios de horario, lo de siempre
    const normal = challengeWindow(new Date("2026-11-17T12:00:00Z"), { weekdays: [1, 6], hour: 9 }, new Date("2026-11-16T12:00:00Z"));
    expect(normal).toEqual({ publishedAt: new Date("2026-11-16T12:00:00Z"), closesAt: new Date("2026-11-21T12:00:00Z") });
  });

  it("GET muestra el de ahora y las preguntas; PATCH cambia el horario y se revierte", async () => {
    const { agent } = await staff("super_admin");
    const res = await agent.get("/admin/challenges").expect(200);
    expect(res.body.settings.map((s: { key: string }) => s.key)).toContain("challenge.hour");
    expect(res.body.upcoming).toHaveLength(3);
    expect(res.body.current).toMatchObject({ started: 0, finished: 0 });

    const patch = await agent.patch("/admin/challenges").send({ values: { "challenge.day_wed": 1, "challenge.hour": 10 } }).expect(200);
    expect(patch.body.settings.find((s: { key: string }) => s.key === "challenge.hour").value).toBe(10);
    const log = await lastLog("challenge.update");
    expect(log.before).toEqual({ "challenge.day_wed": 0, "challenge.hour": 9 });

    await agent.post(`/admin/audit/${log.id}/revert`).send({}).expect(200);
    expect((await Setting.findByPk("challenge.hour"))!.value).toBe(9);
  });

  it("rechaza recetas imposibles y no mezcla con la economía", async () => {
    const { agent } = await staff("admin");
    const none = { "challenge.day_mon": 0, "challenge.day_sat": 0 };
    expect((await agent.patch("/admin/challenges").send({ values: none })).status).toBe(400);
    expect((await agent.patch("/admin/challenges").send({ values: { "challenge.own_review": 7 } })).status).toBe(400);
    expect((await agent.patch("/admin/challenges").send({ values: { "challenge.explore_hard": 10, "challenge.discover_hard": 10 } })).status).toBe(400);
    expect((await Setting.findByPk("challenge.day_mon"))!.value).toBe(1); // no quedó nada a medias

    expect((await agent.patch("/admin/challenges").send({ values: { "xp.star_completed": 60 } })).status).toBe(400);
    expect((await agent.patch("/admin/settings").send({ values: { "challenge.hour": 10 } })).status).toBe(400);
    const economy = await agent.get("/admin/settings").expect(200);
    expect(economy.body.settings.some((s: { key: string }) => s.key.startsWith("challenge."))).toBe(false);

    const { agent: teacher } = await staff("teacher");
    expect((await teacher.get("/admin/challenges")).status).toBe(403);
  });

  it("si cambia el horario, el desafío nuevo no se superpone con el anterior", async () => {
    // El anterior cerró el lunes 16 a las 9; con el horario nuevo (solo miércoles) la última salida
    // sería el miércoles 11, antes de que cerrara: entonces el nuevo arranca el lunes 16 a las 9
    await sequelize.query("TRUNCATE challenges CASCADE"); // la tabla no se vacía entre tests
    await Challenge.create({ publishedAt: new Date("2026-11-14T12:00:00Z"), closesAt: new Date("2026-11-16T12:00:00Z") });
    await Setting.update({ value: 0 }, { where: { id: ["challenge.day_mon", "challenge.day_sat"] } });
    await Setting.update({ value: 1 }, { where: { id: "challenge.day_wed" } });
    const { getCurrentChallenge } = await import("../src/games/challengeFlow.js");
    const student = await createUser("alumno@test.com");
    const view = await getCurrentChallenge(student.id, new Date("2026-11-17T12:00:00Z"));
    expect(new Date(view.challenge.publishedAt)).toEqual(new Date("2026-11-16T12:00:00Z"));
    expect(new Date(view.challenge.closesAt)).toEqual(new Date("2026-11-18T12:00:00Z"));
  });
});
