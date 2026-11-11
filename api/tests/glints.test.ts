import { describe, expect, it } from "vitest";
import type { Agent } from "supertest";
import { GlintEvent, StreakBadge, User } from "../src/models/index.js";
import { addDays, argentinaDay } from "../src/games/streak.js";
import { createPythonStar, createQuestion, enrolledStudent } from "./helpers.js";

const yesterday = () => addDays(argentinaDay(), -1);

// Un alumno con una estrella de dos preguntas, con la racha que se le pase (jugó por última vez ayer)
async function playerWithStreak(streak: number) {
  const { product, star } = await createPythonStar();
  const questions = [
    await createQuestion({ productId: product.id, starId: star.id, position: 1 }),
    await createQuestion({ productId: product.id, starId: star.id, position: 2 }),
  ];
  const agent = await enrolledStudent();
  const user = (await User.findOne({ where: { email: "alumno@test.com" } }))!;
  await user.update({ streak, lastActiveOn: streak > 0 ? yesterday() : null });
  return { agent, user, questions };
}

async function answer(agent: Agent, questionId: string) {
  const res = await agent.post(`/questions/${questionId}/answer`).send({ response: { choice: 0 } });
  expect(res.status).toBe(200);
  return res.body;
}

describe("insignias de racha", () => {
  it("al llegar a 7 días da la insignia y 20 destellos, y lo avisa una sola vez", async () => {
    const { agent, user, questions } = await playerWithStreak(6);

    const first = await answer(agent, questions[0]!.id);
    expect(first.newBadges).toEqual([{ days: 7, earnedAt: expect.any(String), glints: 20 }]);

    // La segunda respuesta del día ya no avisa
    const second = await answer(agent, questions[1]!.id);
    expect(second.newBadges).toEqual([]);

    await user.reload();
    expect(user).toMatchObject({ streak: 7, glints: 20 });
    expect(await StreakBadge.count({ where: { userId: user.id } })).toBe(1);
    expect(await GlintEvent.count({ where: { userId: user.id, reason: "streak_badge" } })).toBe(1);
  });

  it("antes de los 7 días no da nada", async () => {
    const { agent, user, questions } = await playerWithStreak(5);
    expect((await answer(agent, questions[0]!.id)).newBadges).toEqual([]);
    expect(await StreakBadge.count()).toBe(0);
    expect((await User.findByPk(user.id))!.glints).toBe(0);
  });

  it("una racha que ya pasó los umbrales recibe todas las que le faltan", async () => {
    const { agent, user, questions } = await playerWithStreak(99);
    const body = await answer(agent, questions[0]!.id);
    expect(body.newBadges.map((b: { days: number }) => b.days)).toEqual([7, 30, 100]);
    expect((await User.findByPk(user.id))!.glints).toBe(20 + 60 + 200);
  });

  it("las insignias quedan aunque la racha se corte, y no se dan de nuevo", async () => {
    const { agent, user, questions } = await playerWithStreak(6);
    await answer(agent, questions[0]!.id);

    // Se le corta la racha y vuelve a llegar a 7: no hay insignia ni destellos nuevos
    await user.update({ streak: 6, lastActiveOn: yesterday() });
    await GlintEvent.sequelize!.query("DELETE FROM daily_activity");
    expect((await answer(agent, questions[1]!.id)).newBadges).toEqual([]);
    expect((await User.findByPk(user.id))!.glints).toBe(20);

    await user.update({ streak: 3, lastActiveOn: addDays(argentinaDay(), -20) });
    const stats = await agent.get("/me/stats");
    expect(stats.body).toMatchObject({ streak: 0, glints: 20, badges: [{ days: 7, earnedAt: expect.any(String) }] });
  });

  it("las estrellas no dan destellos", async () => {
    const { agent, user, questions } = await playerWithStreak(0);
    await answer(agent, questions[0]!.id);
    await answer(agent, questions[1]!.id);
    expect(await GlintEvent.count()).toBe(0);
    expect((await User.findByPk(user.id))!.glints).toBe(0);
  });

  it("los destellos no se pueden mandar desde el navegador", async () => {
    const { agent, user, questions } = await playerWithStreak(0);
    await agent
      .post(`/questions/${questions[0]!.id}/answer`)
      .send({ response: { choice: 0 }, glints: 999, glintsGained: 999, newBadges: [{ days: 100 }] });
    expect((await User.findByPk(user.id))!.glints).toBe(0);
    expect(await StreakBadge.count()).toBe(0);
  });
});

describe("la base de los destellos", () => {
  it("no acepta un saldo negativo ni un movimiento de 0", async () => {
    const { user } = await playerWithStreak(0);
    await expect(user.update({ glints: -1 })).rejects.toThrow(/users_glints_not_negative/);
    await expect(
      GlintEvent.create({ userId: user.id, amount: 0, reason: "review_completed", referenceId: user.id })
    ).rejects.toThrow(/glint_events_amount_not_zero/);
  });

  it("no da dos veces por el mismo motivo y referencia", async () => {
    const { user } = await playerWithStreak(0);
    const event = { userId: user.id, amount: 3, reason: "review_completed" as const, referenceId: user.id };
    await GlintEvent.create(event);
    await expect(GlintEvent.create(event)).rejects.toThrow();
  });

  it("solo acepta insignias de 7, 30 y 100 días, una de cada una por alumno", async () => {
    const { user } = await playerWithStreak(0);
    await expect(StreakBadge.create({ userId: user.id, days: 8 })).rejects.toThrow(/streak_badges_days_valid/);
    await StreakBadge.create({ userId: user.id, days: 7 });
    await expect(StreakBadge.create({ userId: user.id, days: 7 })).rejects.toThrow();
  });
});
