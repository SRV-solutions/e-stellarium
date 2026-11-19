import { describe, expect, it } from "vitest";
import type { Agent } from "supertest";
import { sequelize } from "../src/db.js";
import { AuditLog, Setting, ShopItem, User } from "../src/models/index.js";
import { SETTING_KEYS } from "../src/games/economy.js";
import { checkIntegrity } from "../src/lib/integrity.js";
import { verifyAuditChain } from "../src/lib/audit.js";
import { createPythonStar, createQuestion, createUser, enrolledStudent, loginAs, setRole } from "./helpers.js";

async function staff(role: "admin" | "super_admin" = "super_admin") {
  const user = await setRole(await createUser(`${role}@test.com`), role);
  return { user, agent: await loginAs(`${role}@test.com`) };
}

async function lastLog(action: string) {
  return (await AuditLog.findOne({ where: { action }, order: [["id", "DESC"]] }))!;
}

async function shopper(glints: number) {
  const agent = await enrolledStudent(["python"], "alumno@test.com");
  const user = (await User.findOne({ where: { email: "alumno@test.com" } }))!;
  await sequelize.transaction((t) => user.update({ glints }, { transaction: t }));
  return { agent, user };
}

// Los problemas de integridad en las tablas de la economía (los ayudantes crean usuarios sin sellar)
async function economyProblems() {
  return (await checkIntegrity()).filter((p) => "table" in p && (p.table === "settings" || p.table === "shop_items"));
}

async function value(key: string) {
  return (await Setting.findByPk(key))!.value;
}

describe("settings", () => {
  it("la tabla tiene exactamente las claves de economy.ts", async () => {
    const rows = await Setting.findAll();
    expect(rows.map((r) => r.id).sort()).toEqual([...SETTING_KEYS].sort());
  });

  it("la base no deja un cupón de más del 60 % ni valores negativos", async () => {
    await expect(
      sequelize.query("UPDATE settings SET value = 70 WHERE id = 'coupon.first_percent'")
    ).rejects.toMatchObject({ original: { constraint: "settings_coupon_percent_cap" } });
    await expect(
      sequelize.query("UPDATE settings SET value = -1 WHERE id = 'xp.star_completed'")
    ).rejects.toMatchObject({ original: { constraint: "settings_value_not_negative" } });
  });
});

describe("GET y PATCH /admin/settings", () => {
  it("piden economy:edit", async () => {
    await setRole(await createUser("docente@test.com"), "teacher");
    const teacher = await loginAs("docente@test.com");
    expect((await teacher.get("/admin/settings")).status).toBe(403);
    expect((await teacher.patch("/admin/settings").send({ values: { "xp.star_completed": 60 } })).status).toBe(403);

    // El admin lo tiene en la matriz inicial
    const { agent } = await staff("admin");
    const res = await agent.get("/admin/settings");
    expect(res.status).toBe(200);
    expect(res.body.settings.find((s: { key: string }) => s.key === "xp.star_completed")).toMatchObject({
      value: 50,
      min: 0,
      max: 500,
    });
  });

  it("cambia los valores y deja un registro con solo lo que cambió", async () => {
    const { user, agent } = await staff();
    const res = await agent
      .patch("/admin/settings")
      .send({ values: { "xp.star_completed": 60, "glints.challenge_correct": 4, "xp.exam_passed": 100 } });
    expect(res.status).toBe(200);
    expect(await value("xp.star_completed")).toBe(60);

    const log = await lastLog("economy.update");
    expect(log).toMatchObject({
      actorId: user.id,
      targetType: "settings",
      reversible: true,
      before: { "glints.challenge_correct": 3, "xp.star_completed": 50 },
      after: { "glints.challenge_correct": 4, "xp.star_completed": 60 },
    });
    // Mandar lo mismo no deja otro registro
    await agent.patch("/admin/settings").send({ values: { "xp.star_completed": 60 } }).expect(200);
    expect(await AuditLog.count({ where: { action: "economy.update" } })).toBe(1);
    expect(await economyProblems()).toEqual([]);
    expect((await verifyAuditChain()).brokenAt).toBeNull();
  });

  it("rechaza claves que no existen y números fuera de rango", async () => {
    const { agent } = await staff();
    const send = (values: unknown) => agent.patch("/admin/settings").send({ values });
    expect((await send({ "xp.inventado": 3 })).status).toBe(400);
    expect((await send({ "coupon.first_percent": 70 })).status).toBe(400);
    expect((await send({ "xp.star_completed": 2.5 })).status).toBe(400);
    expect((await send({ "xp.star_completed": "60" })).status).toBe(400);
    expect((await send({})).status).toBe(400);
    expect((await send([1])).status).toBe(400);
    expect(await value("coupon.first_percent")).toBe(60);
  });

  it("el juego usa los valores nuevos desde el próximo pedido", async () => {
    const { agent: admin } = await staff();
    await admin.patch("/admin/settings").send({ values: { "xp.question_correct": 25, "xp.star_completed": 0 } });

    const { product, star } = await createPythonStar();
    const question = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    const agent = await enrolledStudent();
    const options: string[] = (await agent.get(`/stars/${star.id}`)).body.questions[0].content.options;
    const res = await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: options.indexOf("4") } });
    expect(res.body).toMatchObject({ correct: true, xpGained: 25, starXp: 0 });

    const economy = await agent.get("/economy");
    expect(economy.body.xp).toMatchObject({ questionCorrect: 25, starCompleted: 0 });
    expect(economy.body.freezes).toEqual({ freePerMonth: 2, boughtPerMonth: 2 });
    expect(economy.body.badges).toEqual([
      { days: 7, glints: 20 },
      { days: 30, glints: 60 },
      { days: 100, glints: 200 },
    ]);
  });
});

describe("GET, POST y PATCH /admin/shop", () => {
  function patch(agent: Agent, id: string, body: object) {
    return agent.patch(`/admin/shop/${id}`).send(body);
  }

  it("lista todo con cuántos lo tienen, y pide economy:edit", async () => {
    const { agent: student } = await shopper(0);
    expect((await student.get("/admin/shop")).status).toBe(403);

    const { agent } = await staff();
    const res = await agent.get("/admin/shop");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(43);
    expect(res.body.items[0]).toMatchObject({ id: "coupon_10", kind: "coupon", percent: 10, price: 150, count: 0 });
    expect(res.body.items.find((i: { id: string }) => i.id === "blue")).toMatchObject({ fixed: true, retirable: false });
  });

  it("un precio nuevo vale en la tienda y queda en la bitácora", async () => {
    const { agent } = await staff();
    const res = await patch(agent, "orbit", { price: 90, note: "Una luna chiquita" });
    expect(res.status).toBe(200);
    expect(await lastLog("shop.update")).toMatchObject({
      targetType: "shop_item",
      targetId: "orbit",
      before: { price: 120, note: "Una luna que gira" },
      after: { price: 90, note: "Una luna chiquita" },
    });

    const { agent: student } = await shopper(100);
    const shop = (await student.get("/shop")).body;
    expect(shop.cosmetics.find((c: { item: string }) => c.item === "orbit")).toMatchObject({ price: 90, blockedBy: null });
    expect((await student.post("/shop/purchases").send({ item: "orbit" })).status).toBe(201);
    expect((await User.findOne({ where: { email: "alumno@test.com" } }))!.glints).toBe(10);
    expect(await economyProblems()).toEqual([]);
  });

  it("lo retirado no se vende, pero quien lo tiene lo sigue viendo y llevando", async () => {
    const { agent: student } = await shopper(1000);
    await student.post("/shop/purchases").send({ item: "rings" }).expect(201);

    const { agent } = await staff();
    await patch(agent, "rings", { active: false }).expect(200);
    await patch(agent, "coupon_30", { active: false }).expect(200);

    const shop = (await student.get("/shop")).body;
    expect(shop.coupons.map((c: { item: string }) => c.item)).toEqual(["coupon_10", "coupon_20"]);
    expect(shop.cosmetics.find((c: { item: string }) => c.item === "rings")).toMatchObject({ owned: true });
    expect((await student.post("/shop/purchases").send({ item: "coupon_30" })).status).toBe(404);
    expect((await student.put("/me/cosmetics").send({ kind: "frame", id: "rings" })).status).toBe(200);

    // Otro alumno no lo ve
    await createUser("otro@test.com");
    const other = await loginAs("otro@test.com");
    const otherShop = (await other.get("/shop")).body;
    expect(otherShop.cosmetics.find((c: { item: string }) => c.item === "rings")).toBeUndefined();
  });

  it("protege el azul y el protector, y valida cada campo según el tipo", async () => {
    const { agent } = await staff();
    expect((await patch(agent, "blue", { price: 10 })).status).toBe(409);
    expect((await patch(agent, "blue", { active: false })).status).toBe(409);
    expect((await patch(agent, "blue", { name: "Azul marino" })).status).toBe(200);
    expect((await patch(agent, "streak_freeze", { active: false })).status).toBe(409);
    expect((await patch(agent, "orbit", { percent: 20 })).status).toBe(400);
    expect((await patch(agent, "coupon_10", { percent: 70 })).status).toBe(400);
    expect((await patch(agent, "aurora", { hex: "verde" })).status).toBe(400);
    expect((await patch(agent, "navigator", { name: "  " })).status).toBe(400);
    expect((await patch(agent, "navigator", { price: -5 })).status).toBe(400);
    expect((await patch(agent, "no-existe", { price: 5 })).status).toBe(404);
  });

  it("un color puede llevar un efecto de la lista, y solo los colores", async () => {
    const { agent } = await staff();
    const ok = await agent.post("/admin/shop").send({ kind: "color", name: "Brasa", price: 300, hex: "#ff5533", effect: "pulse" });
    expect(ok.status).toBe(201);
    expect(ok.body.item).toMatchObject({ id: "brasa", effect: "pulse" });
    expect((await patch(agent, "brasa", { effect: null })).body.item.effect).toBeNull();
    expect((await patch(agent, "brasa", { effect: "flow" })).body.item.effect).toBe("flow");

    expect((await agent.post("/admin/shop").send({ kind: "color", name: "Raro", price: 1, hex: "#ff5533", effect: "humo" })).status).toBe(400);
    expect((await patch(agent, "brasa", { effect: "humo" })).status).toBe(400);
    expect((await patch(agent, "navigator", { effect: "flow" })).status).toBe(400); // un título no lleva efecto
  });

  it("agrega cupones, colores y títulos, pero no marcos", async () => {
    const { agent } = await staff();
    const color = await agent.post("/admin/shop").send({ kind: "color", name: "Marte", note: "Rojo óxido", price: 200, hex: "#FF7A50" });
    expect(color.status).toBe(201);
    expect(color.body.item).toMatchObject({ id: "marte", hex: "#ff7a50", active: true, position: 43 });
    const coupon = await agent.post("/admin/shop").send({ kind: "coupon", name: "Cupón del 15 %", price: 250, percent: 15 });
    expect(coupon.body.item.id).toBe("coupon_15");
    const title = await agent
      .post("/admin/shop")
      .send({ kind: "title", name: "Guardiana del cometa", altName: "Guardián del cometa", price: 150 });
    expect(title.body.item).toMatchObject({ id: "guardiana_del_cometa", altName: "Guardián del cometa" });

    expect((await agent.post("/admin/shop").send({ kind: "frame", name: "Halo", price: 100 })).status).toBe(400);
    expect((await agent.post("/admin/shop").send({ kind: "streak_freeze", name: "Otro", price: 1 })).status).toBe(400);
    expect((await agent.post("/admin/shop").send({ kind: "color", name: "Sin color", price: 1 })).status).toBe(400);
    expect((await agent.post("/admin/shop").send({ kind: "coupon", name: "Cupón", price: 1, percent: 61 })).status).toBe(400);

    expect(await lastLog("shop.create")).toMatchObject({ targetId: "guardiana_del_cometa", before: { active: false } });

    // Se compra y se lleva como cualquier otro
    const { agent: student } = await shopper(300);
    await student.post("/shop/purchases").send({ item: "marte" }).expect(201);
    const worn = await student.put("/me/cosmetics").send({ kind: "color", id: "marte" });
    expect(worn.body.worn).toMatchObject({ color: "marte", colorHex: "#ff7a50" });
    expect(await economyProblems()).toEqual([]);
  });

  it("la verificación nota un precio cambiado a mano en la base", async () => {
    await sequelize.query("UPDATE shop_items SET price = 1 WHERE id = 'coupon_30'");
    expect(await checkIntegrity()).toContainEqual({ kind: "row", table: "shop_items", rowId: "coupon_30" });
  });
});

describe("revertir la economía", () => {
  it("vuelve los valores de ese registro, y no toca los demás", async () => {
    const { agent } = await staff();
    await agent.patch("/admin/settings").send({ values: { "xp.star_completed": 60 } });
    const original = await lastLog("economy.update");
    await agent.patch("/admin/settings").send({ values: { "xp.exam_passed": 150 } });

    const res = await agent.post(`/admin/audit/${original.id}/revert`);
    expect(res.status).toBe(200);
    expect(await value("xp.star_completed")).toBe(50);
    expect(await value("xp.exam_passed")).toBe(150);
    expect(await AuditLog.findByPk(res.body.revertId)).toMatchObject({ action: "audit.revert", revertsId: original.id });
  });

  it("si lo cambiaron después, avisa el conflicto antes de revertir", async () => {
    const { agent } = await staff();
    await agent.patch("/admin/settings").send({ values: { "xp.star_completed": 60 } });
    const original = await lastLog("economy.update");
    await agent.patch("/admin/settings").send({ values: { "xp.star_completed": 70 } });

    const res = await agent.post(`/admin/audit/${original.id}/revert`);
    expect(res.status).toBe(409);
    expect(res.body.conflict).toEqual({
      before: { "xp.star_completed": 50 },
      recorded: { "xp.star_completed": 60 },
      current: { "xp.star_completed": 70 },
    });
    await agent.post(`/admin/audit/${original.id}/revert`).send({ confirm: true }).expect(200);
    expect(await value("xp.star_completed")).toBe(50);
  });

  it("revierte un cambio de la tienda y retira lo agregado", async () => {
    const { agent } = await staff();
    await agent.patch("/admin/shop/eclipse").send({ price: 260 });
    const update = await lastLog("shop.update");
    await agent.post(`/admin/audit/${update.id}/revert`).expect(200);
    expect((await ShopItem.findByPk("eclipse"))!.price).toBe(200);

    await agent.post("/admin/shop").send({ kind: "title", name: "Exploradora", price: 120 });
    const created = await lastLog("shop.create");
    await agent.post(`/admin/audit/${created.id}/revert`).expect(200);
    expect((await ShopItem.findByPk("exploradora"))!.active).toBe(false);
    // Ya retirado: no hay nada que revertir otra vez
    expect((await agent.post(`/admin/audit/${created.id}/revert`)).status).toBe(409);
    expect(await economyProblems()).toEqual([]);
  });

  it("la bitácora muestra el nombre del ítem", async () => {
    const { agent } = await staff();
    await agent.patch("/admin/shop/aurora").send({ price: 99 });
    const res = await agent.get("/admin/audit?action=shop.update");
    expect(res.body.entries[0].target).toEqual({ type: "shop_item", id: "aurora", name: "Aurora" });
  });
});
