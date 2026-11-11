import { describe, expect, it } from "vitest";
import type { Agent } from "supertest";
import { Coupon, GlintEvent, User } from "../src/models/index.js";
import { monthRange } from "../src/games/shop.js";
import { addDays, argentinaDay } from "../src/games/streak.js";
import { createExamReady, createPythonStar, createQuestion, enrolledStudent, http } from "./helpers.js";

async function shopper(glints: number) {
  const agent = await enrolledStudent();
  const user = (await User.findOne({ where: { email: "alumno@test.com" } }))!;
  await user.update({ glints });
  return { agent, user };
}

function purchase(agent: Agent, item: unknown, extra: object = {}) {
  return agent.post("/shop/purchases").send({ item, ...extra });
}

const DAY = 24 * 60 * 60 * 1000;

describe("GET /shop", () => {
  it("pide sesión", async () => {
    expect((await http().get("/shop")).status).toBe(401);
  });

  it("muestra el saldo, los precios y cuánto falta", async () => {
    const { agent } = await shopper(200);
    const res = await agent.get("/shop");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      glints: 200,
      couponValidDays: 60,
      couponBoughtThisWeek: false,
      couponAvailableAt: null,
      coupons: [
        { item: "coupon_10", percent: 10, price: 150, missing: 0, blockedBy: null },
        { item: "coupon_20", percent: 20, price: 350, missing: 150, blockedBy: "glints" },
        { item: "coupon_30", percent: 30, price: 700, missing: 500, blockedBy: "glints" },
      ],
      freeze: { item: "streak_freeze", price: 60, missing: 0, blockedBy: null, boughtThisMonth: 0, monthlyLimit: 2, owned: 0 },
    });
  });
});

describe("comprar cupones", () => {
  it("descuenta los destellos y crea el cupón de la tienda, que aparece en Mis cupones", async () => {
    const { agent, user } = await shopper(200);

    const res = await purchase(agent, "coupon_10");
    expect(res.status).toBe(201);
    expect(res.body.coupon).toMatchObject({ percent: 10 });
    expect(res.body.coupon.code).toMatch(/^ESTL-TI-[2-9A-Z]{6}$/);
    expect(res.body.shop).toMatchObject({ glints: 50, couponBoughtThisWeek: true });

    await user.reload();
    expect(user.glints).toBe(50);
    const coupon = (await Coupon.findOne({ where: { userId: user.id } }))!;
    expect(coupon).toMatchObject({ source: "shop", constellationId: null, examAttemptId: null });
    expect(coupon.expiresAt.getTime() - coupon.createdAt.getTime()).toBeCloseTo(60 * DAY, -4);
    expect(await GlintEvent.findOne({ where: { userId: user.id } })).toMatchObject({
      amount: -150,
      reason: "coupon_purchase",
      referenceId: coupon.id,
    });

    const mine = await agent.get("/coupons");
    expect(mine.body.coupons).toEqual([expect.objectContaining({ percent: 10, source: "shop", course: null })]);
  });

  it("uno por semana: el siguiente se puede comprar el lunes", async () => {
    const { agent, user } = await shopper(1000);
    expect((await purchase(agent, "coupon_10")).status).toBe(201);

    const again = await purchase(agent, "coupon_20");
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/esta semana/);
    const view = (await agent.get("/shop")).body;
    expect(view.coupons.every((c: { blockedBy: string }) => c.blockedBy === "weekly_limit")).toBe(true);
    expect(new Date(view.couponAvailableAt).getUTCDay()).toBe(1); // lunes (00:00 de Argentina = 03:00 UTC)
    expect((await User.findByPk(user.id))!.glints).toBe(850);

    // Pasada una semana, puede comprar otro
    await Coupon.update({ createdAt: new Date(Date.now() - 8 * DAY) }, { where: { userId: user.id } });
    expect((await purchase(agent, "coupon_20")).status).toBe(201);
  });

  it("si no le alcanza, no compra nada", async () => {
    const { agent, user } = await shopper(349);
    const res = await purchase(agent, "coupon_20");
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/destellos/);
    expect((await User.findByPk(user.id))!.glints).toBe(349);
    expect(await Coupon.count()).toBe(0);
    expect(await GlintEvent.count()).toBe(0);
  });

  it("el precio y el porcentaje nunca vienen del navegador", async () => {
    const { agent, user } = await shopper(150);
    expect((await purchase(agent, "coupon_60")).status).toBe(400);
    expect((await purchase(agent, undefined)).status).toBe(400);

    const res = await purchase(agent, "coupon_10", { price: 0, percent: 60 });
    expect(res.status).toBe(201);
    expect(res.body.coupon.percent).toBe(10);
    expect((await User.findByPk(user.id))!.glints).toBe(0);
  });

  it("dos compras a la vez no gastan los mismos destellos", async () => {
    const { agent, user } = await shopper(150);
    const [a, b] = await Promise.all([purchase(agent, "streak_freeze"), purchase(agent, "coupon_10")]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((await User.findByPk(user.id))!.glints).toBeGreaterThanOrEqual(0);
  });

  it("los cupones de la tienda no le quitan el 60 % al primero de constelación", async () => {
    const { agent, user } = await shopper(150);
    await purchase(agent, "coupon_10");
    const { exam } = await createExamReady(user.id);
    const res = await agent.get(`/exams/${exam.id}`);
    expect(res.body.rules.couponPercent).toBe(60);
  });

  it("la base no acepta un cupón de la tienda con constelación, ni uno de constelación sin ella", async () => {
    const { user } = await shopper(0);
    const base = { code: "ESTL-TI-ABCDEF", percent: 10, expiresAt: new Date(), userId: user.id };
    await expect(Coupon.create({ ...base, source: "constellation" })).rejects.toThrow(/coupons_source_matches/);
    const { constellation } = await createPythonStar();
    await expect(Coupon.create({ ...base, source: "shop", constellationId: constellation.id })).rejects.toThrow(
      /coupons_source_matches/
    );
  });
});

describe("comprar protectores", () => {
  it("hasta 2 por mes; se suman a los comprados", async () => {
    const { agent, user } = await shopper(200);
    expect((await purchase(agent, "streak_freeze")).status).toBe(201);
    const second = await purchase(agent, "streak_freeze");
    expect(second.status).toBe(201);
    expect(second.body.shop.freeze).toMatchObject({ boughtThisMonth: 2, owned: 2, blockedBy: "monthly_limit" });
    expect(second.body.shop.freeze.availableAt).toBe(monthRange(new Date()).endsAt.toISOString());

    const third = await purchase(agent, "streak_freeze");
    expect(third.status).toBe(409);
    expect(third.body.error).toMatch(/este mes/);

    await user.reload();
    expect(user).toMatchObject({ glints: 80, boughtFreezes: 2 });
    expect((await agent.get("/me/stats")).body.boughtFreezes).toBe(2);

    // El mes que viene puede comprar más
    await GlintEvent.update({ createdAt: new Date(Date.now() - 40 * DAY) }, { where: { userId: user.id } });
    expect((await purchase(agent, "streak_freeze")).status).toBe(201);
  });

  it("se usan cuando faltan los gratis del mes", async () => {
    const { product, star } = await createPythonStar();
    const question = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    const { agent, user } = await shopper(0);
    // Faltó un día y ya no le quedan gratis este mes
    await user.update({ streak: 4, lastActiveOn: addDays(argentinaDay(), -2), streakFreezes: 0, boughtFreezes: 1 });

    await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: 0 } });
    await user.reload();
    expect(user).toMatchObject({ streak: 5, boughtFreezes: 0 });
  });
});

describe("el mes de Argentina", () => {
  it("empieza el día 1 a las 00:00 de Argentina", () => {
    expect(monthRange(new Date("2026-12-01T02:59:00Z"))).toEqual({
      startsAt: new Date("2026-11-01T03:00:00Z"),
      endsAt: new Date("2026-12-01T03:00:00Z"),
    });
    expect(monthRange(new Date("2026-12-31T12:00:00Z")).endsAt).toEqual(new Date("2027-01-01T03:00:00Z"));
  });
});
