import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { User, XpEvent } from "../src/models/index.js";
import { weekRange } from "../src/games/ranking.js";
import { createUser, http, loginAs } from "./helpers.js";

const DAY = 24 * 60 * 60 * 1000;

// Un movimiento de experiencia hace `daysAgo` días (o `msAgo` milisegundos)
async function xp(user: User, amount: number, msAgo = 0) {
  const event = await XpEvent.create({ userId: user.id, xp: amount, reason: "question_correct", referenceId: randomUUID() });
  await XpEvent.update({ createdAt: new Date(Date.now() - msAgo) }, { where: { id: event.id } });
}

async function person(email: string, alias: string, role: "student" | "admin" = "student") {
  const user = await createUser(email);
  await user.update({ alias, role });
  return user;
}

describe("la semana del ranking", () => {
  it("va de lunes 00:00 a lunes 00:00 de Argentina", () => {
    // Domingo 15 de noviembre a las 23:00 de Argentina (lunes 02:00 UTC)
    const range = weekRange(new Date("2026-11-16T02:00:00Z"));
    expect(range.startsAt).toEqual(new Date("2026-11-09T03:00:00Z"));
    expect(range.endsAt).toEqual(new Date("2026-11-16T03:00:00Z"));
    // Una hora después ya es la semana siguiente
    expect(weekRange(new Date("2026-11-16T03:00:00Z")).startsAt).toEqual(new Date("2026-11-16T03:00:00Z"));
  });
});

describe("GET /ranking", () => {
  it("pide sesión y valida el período", async () => {
    expect((await http().get("/ranking")).status).toBe(401);
    await person("yo@test.com", "yo");
    const agent = await loginAs("yo@test.com");
    expect((await agent.get("/ranking?period=mes")).status).toBe(400);
  });

  it("ordena por la experiencia de la semana, sin staff; en un empate va primero el que llegó antes", async () => {
    const ana = await person("ana@test.com", "ana");
    const beto = await person("beto@test.com", "beto");
    const caro = await person("caro@test.com", "caro");
    const admin = await person("admin@test.com", "staff", "admin");
    await xp(ana, 30, 2000);
    await xp(beto, 30, 1000); // empata con ana, pero llegó después
    await xp(caro, 50);
    await xp(admin, 500);
    await xp(beto, 400, 8 * DAY); // de otra semana: no cuenta en la semanal

    const agent = await loginAs("beto@test.com");
    const res = await agent.get("/ranking");
    expect(res.status).toBe(200);
    expect(res.body.top).toEqual([
      { position: 1, alias: "caro", xp: 50, me: false },
      { position: 2, alias: "ana", xp: 30, me: false },
      { position: 3, alias: "beto", xp: 30, me: true },
    ]);
    expect(res.body.me).toEqual({ position: 3, xp: 30 });

    const all = await agent.get("/ranking?period=all");
    expect(all.body.top[0]).toMatchObject({ alias: "beto", xp: 430 });
    expect(all.body.startsAt).toBeNull();
  });

  it("muestra los 10 primeros y, aparte, el puesto propio aunque esté más abajo", async () => {
    for (let i = 0; i < 11; i++) {
      await xp(await person(`p${i}@test.com`, `p${i}`), 100 - i);
    }
    const yo = await person("yo@test.com", "yo");
    await xp(yo, 1);

    const agent = await loginAs("yo@test.com");
    const res = await agent.get("/ranking");
    expect(res.body.top).toHaveLength(10);
    expect(res.body.top.some((e: { me: boolean }) => e.me)).toBe(false);
    expect(res.body.me).toEqual({ position: 12, xp: 1 });
  });

  it("si no sumó nada esta semana, no tiene puesto; el staff no compite", async () => {
    await person("yo@test.com", "yo");
    const agent = await loginAs("yo@test.com");
    expect((await agent.get("/ranking")).body.me).toEqual({ position: null, xp: 0 });

    await person("admin@test.com", "staff", "admin");
    const staff = await loginAs("admin@test.com");
    expect((await staff.get("/ranking")).body.me).toBeNull();
  });
});
