import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ChallengeAttempt, ChallengeAttemptQuestion, GlintEvent, StarCompletion, StreakBadge, User, XpEvent } from "../src/models/index.js";
import { weekRange } from "../src/games/ranking.js";
import type { RoleKey } from "../src/models/Role.js";
import { Challenge } from "../src/models/index.js";
import { sequelize } from "../src/db.js";
import { recordActivity } from "../src/games/activity.js";
import { addDays, argentinaDay } from "../src/games/streak.js";
import { createPythonStar, createQuestion, createUser, http, loginAs, setRole } from "./helpers.js";

const DAY = 24 * 60 * 60 * 1000;

// Un movimiento de experiencia hace `daysAgo` días (o `msAgo` milisegundos)
async function xp(user: User, amount: number, msAgo = 0) {
  const event = await XpEvent.create({ userId: user.id, xp: amount, reason: "question_correct", referenceId: randomUUID() });
  await XpEvent.update({ createdAt: new Date(Date.now() - msAgo) }, { where: { id: event.id } });
}

async function person(email: string, alias: string, role: RoleKey = "student") {
  const user = await createUser(email);
  await user.update({ alias });
  return setRole(user, role);
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
      { position: 1, alias: "caro", value: 50, me: false, frame: null, avatar: null, title: null, badge: null },
      { position: 2, alias: "ana", value: 30, me: false, frame: null, avatar: null, title: null, badge: null },
      { position: 3, alias: "beto", value: 30, me: true, frame: null, avatar: null, title: null, badge: null },
    ]);
    expect(res.body.me).toEqual({ position: 3, value: 30 });

    const all = await agent.get("/ranking?period=all");
    expect(all.body.top[0]).toMatchObject({ alias: "beto", value: 430 });
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
    expect(res.body.me).toEqual({ position: 12, value: 1 });
  });

  it("si no sumó nada esta semana, no tiene puesto; el staff no compite", async () => {
    await person("yo@test.com", "yo");
    const agent = await loginAs("yo@test.com");
    expect((await agent.get("/ranking")).body.me).toEqual({ position: null, value: 0 });

    await person("admin@test.com", "staff", "admin");
    const staff = await loginAs("admin@test.com");
    // El staff que no cursa nada ni siquiera ve el ranking (ver requirePlayer)
    await staff.get("/ranking").expect(403);
  });
});

// Un desafío terminado: `total` preguntas y `right` bien
let nextPosition = 1;
async function makeAttempt(user: User, total: number, right: number, base?: Awaited<ReturnType<typeof createPythonStar>>) {
  const { product, star } = base ?? (await createPythonStar());
  const challenge = await Challenge.create({ publishedAt: new Date(Date.now() - Math.random() * 1e9), closesAt: new Date(Date.now() + 1e9) });
  const attempt = await ChallengeAttempt.create({ challengeId: challenge.id, userId: user.id, finishedAt: new Date(), correctCount: right });
  for (let i = 0; i < total; i++) {
    const q = await createQuestion({ productId: product.id, starId: star.id, position: nextPosition++ });
    await ChallengeAttemptQuestion.create({ attemptId: attempt.id, questionId: q.id, questionVersion: 1, position: i + 1, part: "own", correct: i < right });
  }
  return attempt;
}

describe("las otras tablas del ranking", () => {
  it("rechaza una tabla que no existe", async () => {
    await person("yo@test.com", "yo");
    const agent = await loginAs("yo@test.com");
    expect((await agent.get("/ranking?board=nada")).status).toBe(400);
  });

  it("mejor racha: la más larga de siempre, con la insignia más alta, aunque se haya cortado", async () => {
    const ana = await person("ana@test.com", "ana");
    const beto = await person("beto@test.com", "beto");
    await person("caro@test.com", "caro"); // sin racha: no aparece
    await ana.update({ bestStreak: 35, streak: 0 });
    await beto.update({ bestStreak: 8, streak: 3 });
    for (const days of [7, 30]) await StreakBadge.create({ userId: ana.id, days });
    await StreakBadge.create({ userId: beto.id, days: 7 });

    const res = await (await loginAs("caro@test.com")).get("/ranking?board=best_streak");
    expect(res.body.board).toBe("best_streak");
    expect(res.body.top.map((e: { alias: string; value: number; badge: number }) => [e.alias, e.value, e.badge])).toEqual([
      ["ana", 35, 30],
      ["beto", 8, 7],
    ]);
    expect(res.body.me).toEqual({ position: null, value: 0 });
  });

  it("la insignia de la fila es la más alta que alcanzó con esos días, no la mejor que ganó alguna vez", async () => {
    const hoy = argentinaDay();
    const ana = await person("ana@test.com", "ana");
    await ana.update({ streak: 13, bestStreak: 40, lastActiveOn: hoy });
    for (const days of [7, 30]) await StreakBadge.create({ userId: ana.id, days });
    const agent = await loginAs("ana@test.com");
    expect((await agent.get("/ranking?board=streak")).body.top[0]).toMatchObject({ value: 13, badge: 7 });
    expect((await agent.get("/ranking?board=best_streak")).body.top[0]).toMatchObject({ value: 40, badge: 30 });
  });

  it("racha vigente: la que se cortó no cuenta; la que sigue viva sí, aunque hoy no haya jugado", async () => {
    const hoy = argentinaDay();
    const ayer = addDays(hoy, -1);
    const ana = await person("ana@test.com", "ana");
    const beto = await person("beto@test.com", "beto");
    const caro = await person("caro@test.com", "caro");
    await ana.update({ streak: 10, lastActiveOn: hoy });
    await beto.update({ streak: 12, lastActiveOn: ayer }); // sigue viva hasta las 00:00
    // Hace 20 días, sin protectores: se cortó
    await caro.update({ streak: 40, lastActiveOn: addDays(hoy, -20), streakFreezes: 0, boughtFreezes: 0 });

    const res = await (await loginAs("ana@test.com")).get("/ranking?board=streak");
    expect(res.body.top.map((e: { alias: string; value: number }) => [e.alias, e.value])).toEqual([
      ["beto", 12],
      ["ana", 10],
    ]);
    expect(res.body.me).toEqual({ position: 2, value: 10 });
  });

  it("estrellas encendidas: cuenta las lecciones completadas", async () => {
    const { star } = await createPythonStar();
    const ana = await person("ana@test.com", "ana");
    const beto = await person("beto@test.com", "beto");
    await StarCompletion.create({ userId: ana.id, starId: star.id });
    const res = await (await loginAs("beto@test.com")).get("/ranking?board=stars");
    expect(res.body.top).toEqual([{ position: 1, alias: "ana", value: 1, me: false, frame: null, avatar: null, title: null, badge: null }]);
    expect(res.body.me).toEqual({ position: null, value: 0 });
    expect(beto.id).toBeTruthy();
  });

  it("desafíos: solo los terminados con todas las preguntas bien", async () => {
    const ana = await person("ana@test.com", "ana");
    const beto = await person("beto@test.com", "beto");
    const base = await createPythonStar();
    await makeAttempt(ana, 2, 2, base);
    await makeAttempt(ana, 2, 1, base); // con un error: no cuenta
    await makeAttempt(beto, 2, 1, base);
    const res = await (await loginAs("beto@test.com")).get("/ranking?board=challenges");
    expect(res.body.top).toHaveLength(1);
    expect(res.body.top[0]).toMatchObject({ alias: "ana", value: 1 });
  });

  it("destellos: suma lo ganado y no resta lo gastado", async () => {
    const ana = await person("ana@test.com", "ana");
    const beto = await person("beto@test.com", "beto");
    await GlintEvent.create({ userId: ana.id, amount: 50, reason: "review_completed", referenceId: randomUUID() });
    await GlintEvent.create({ userId: ana.id, amount: -30, reason: "cosmetic_purchase", referenceId: randomUUID() });
    await GlintEvent.create({ userId: beto.id, amount: 20, reason: "review_completed", referenceId: randomUUID() });
    const res = await (await loginAs("beto@test.com")).get("/ranking?board=glints");
    expect(res.body.top.map((e: { alias: string; value: number }) => [e.alias, e.value])).toEqual([
      ["ana", 50],
      ["beto", 20],
    ]);
  });

  it("recordActivity sube best_streak y no lo baja cuando la racha se corta", async () => {
    const ana = await person("ana@test.com", "ana");
    await ana.update({ streak: 5, bestStreak: 9, lastActiveOn: addDays(argentinaDay(), -30), streakFreezes: 0, boughtFreezes: 0 });
    await sequelize.transaction(async (t) => {
      await recordActivity(ana, new Date(), t);
    });
    await ana.reload();
    expect([ana.streak, ana.bestStreak]).toEqual([1, 9]);
    await sequelize.transaction(async (t) => {
      await ana.update({ streak: 9, lastActiveOn: argentinaDay() }, { transaction: t });
      await recordActivity(ana, new Date(Date.now() + DAY), t);
    });
    await ana.reload();
    expect(ana.bestStreak).toBe(10);
  });
});
