import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Agent } from "supertest";
import { GlintEvent, User, UserCosmetic, XpEvent } from "../src/models/index.js";
import { titleText } from "../src/games/cosmetics.js";
import { enrolledStudent } from "./helpers.js";

async function shopper(glints: number) {
  const agent = await enrolledStudent();
  const user = (await User.findOne({ where: { email: "alumno@test.com" } }))!;
  await user.update({ glints });
  return { agent, user };
}

const buy = (agent: Agent, item: string) => agent.post("/shop/purchases").send({ item });
const wear = (agent: Agent, body: object) => agent.put("/me/cosmetics").send(body);

describe("comprar cosméticos", () => {
  it("la tienda los muestra con precio, si los tiene y lo que lleva puesto", async () => {
    const { agent } = await shopper(130);
    const { body } = await agent.get("/shop");
    const byId = Object.fromEntries(body.cosmetics.map((c: { item: string }) => [c.item, c]));

    expect(byId.orbit).toMatchObject({ kind: "frame", name: "Órbita", price: 120, missing: 0, owned: false, blockedBy: null });
    expect(byId.rings).toMatchObject({ price: 300, missing: 170, blockedBy: "glints" });
    // El azul es gratis y ya lo tiene
    expect(byId.blue).toMatchObject({ kind: "color", price: 0, owned: true, blockedBy: "owned", hex: "#4fa3ff" });
    expect(byId.comet_hunter.variants).toEqual(["Cazadora de cometas", "Cazador de cometas"]);
    expect(body.worn).toEqual({ frame: null, color: "blue", title: null, titleVariant: 0, titleText: null });
  });

  it("se compra una sola vez y descuenta los destellos", async () => {
    const { agent, user } = await shopper(300);

    const res = await buy(agent, "orbit");
    expect(res.status).toBe(201);
    expect(res.body.coupon).toBeNull();
    expect(res.body.shop.glints).toBe(180);
    expect(res.body.shop.cosmetics.find((c: { item: string }) => c.item === "orbit")).toMatchObject({
      owned: true,
      blockedBy: "owned",
    });

    const again = await buy(agent, "orbit");
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/Ya lo tenés/);
    expect((await buy(agent, "blue")).status).toBe(409);

    const row = (await UserCosmetic.findOne({ where: { userId: user.id } }))!;
    expect(row.cosmeticId).toBe("orbit");
    expect(await GlintEvent.findOne({ where: { userId: user.id } })).toMatchObject({
      amount: -120,
      reason: "cosmetic_purchase",
      referenceId: row.id,
    });
    expect((await User.findByPk(user.id))!.glints).toBe(180);
  });

  it("si no le alcanza, no compra", async () => {
    const { agent, user } = await shopper(299);
    expect((await buy(agent, "rings")).status).toBe(409);
    expect(await UserCosmetic.count()).toBe(0);
    expect((await User.findByPk(user.id))!.glints).toBe(299);
  });

  it("no hay límite por semana: se pueden comprar varios", async () => {
    const { agent } = await shopper(400);
    expect((await buy(agent, "orbit")).status).toBe(201);
    expect((await buy(agent, "aurora")).status).toBe(201);
    expect((await buy(agent, "navigator")).status).toBe(201);
    expect((await agent.get("/shop")).body.glints).toBe(400 - 120 - 150 - 100);
  });
});

describe("ponerse cosméticos", () => {
  it("se pone lo que compró y se ve en la sesión", async () => {
    const { agent } = await shopper(1000);
    await buy(agent, "eclipse");
    await buy(agent, "nebula");
    await buy(agent, "comet_hunter");

    expect((await wear(agent, { kind: "frame", id: "eclipse" })).body.worn).toMatchObject({ frame: "eclipse" });
    expect((await wear(agent, { kind: "color", id: "nebula" })).body.worn).toMatchObject({ color: "nebula" });
    const titled = await wear(agent, { kind: "title", id: "comet_hunter", variant: 1 });
    expect(titled.status).toBe(200);
    expect(titled.body.worn).toEqual({
      frame: "eclipse",
      color: "nebula",
      title: "comet_hunter",
      titleVariant: 1,
      titleText: "Cazador de cometas",
    });

    const me = await agent.get("/me");
    expect(me.body.user).toMatchObject({ wornFrame: "eclipse", wornColor: "nebula", wornTitle: "comet_hunter" });
  });

  it("se saca con null, y el color vuelve al azul", async () => {
    const { agent, user } = await shopper(500);
    await buy(agent, "orbit");
    await buy(agent, "corona");
    await wear(agent, { kind: "frame", id: "orbit" });
    await wear(agent, { kind: "color", id: "corona" });

    expect((await wear(agent, { kind: "frame", id: null })).body.worn.frame).toBeNull();
    expect((await wear(agent, { kind: "color", id: "blue" })).body.worn.color).toBe("blue");
    await user.reload();
    expect(user.wornColor).toBeNull();
    expect((await wear(agent, { kind: "color", id: null })).status).toBe(400);
  });

  it("no se puede poner lo que no compró, ni algo de otro tipo", async () => {
    const { agent } = await shopper(500);
    await buy(agent, "orbit");
    expect((await wear(agent, { kind: "frame", id: "rings" })).status).toBe(409);
    expect((await wear(agent, { kind: "color", id: "orbit" })).status).toBe(404);
    expect((await wear(agent, { kind: "hat", id: "orbit" })).status).toBe(400);
    expect((await wear(agent, { kind: "title", id: null, variant: 2 })).status).toBe(400);
  });

  it("la base no deja llevar puesto algo que no compró", async () => {
    const { user } = await shopper(0);
    await expect(user.update({ wornFrame: "rings" })).rejects.toThrow(/users_worn_frame_owned/);
  });

  it("se puede borrar un alumno que lleva cosméticos puestos", async () => {
    const { agent, user } = await shopper(200);
    await buy(agent, "orbit");
    await wear(agent, { kind: "frame", id: "orbit" });
    await user.destroy();
    expect(await UserCosmetic.count()).toBe(0);
  });
});

describe("cosméticos en el ranking", () => {
  it("cada fila trae el marco y el título que lleva puestos", async () => {
    const { agent, user } = await shopper(500);
    await buy(agent, "rings");
    await buy(agent, "astronomer");
    await wear(agent, { kind: "frame", id: "rings" });
    await wear(agent, { kind: "title", id: "astronomer", variant: 0 });
    await XpEvent.create({ userId: user.id, xp: 10, reason: "question_correct", referenceId: randomUUID() });

    const { body } = await agent.get("/ranking");
    expect(body.top[0]).toMatchObject({ me: true, frame: "rings", title: "Astrónoma de guardia" });
  });

  it("el título sin dos formas usa siempre su nombre", () => {
    expect(titleText("navigator", 1)).toBe("Navegante");
    expect(titleText(null, 0)).toBeNull();
    expect(titleText("no-existe", 0)).toBeNull();
  });
});
