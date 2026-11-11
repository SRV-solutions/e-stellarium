import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Agent } from "supertest";
import { Answer, DailyActivity, DailyReview, Question, User, XpEvent } from "../src/models/index.js";
import { addDays, argentinaDay } from "../src/games/streak.js";
import { createExamReady, createPythonStar, createQuestion, enrolledStudent, http, rightResponse } from "./helpers.js";

const today = () => argentinaDay();

// Una estrella de Python con `count` preguntas
async function starWithQuestions(count: number) {
  const { product, star } = await createPythonStar();
  const questions: Question[] = [];
  for (let i = 0; i < count; i++) {
    questions.push(await createQuestion({ productId: product.id, starId: star.id, position: i + 1 }));
  }
  return { product, star, questions };
}

// Una respuesta en la estrella, hace `daysAgo` días
async function answered(userId: string, questionId: string, correct: boolean, daysAgo = 1) {
  const answer = await Answer.create({ userId, questionId, context: "star", correct, response: { choice: 0 } });
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await Answer.update({ createdAt }, { where: { id: answer.id } });
}

async function student() {
  const agent = await enrolledStudent();
  const user = (await User.findOne({ where: { email: "alumno@test.com" } }))!;
  return { agent, user };
}

async function openReview(agent: Agent) {
  const res = await agent.get("/review/today");
  expect(res.status).toBe(200);
  return res.body.review;
}

type ReviewItem = { position: number; question: { id: string; content: { options: string[] } } };

// La posición de "4" (la correcta de createQuestion) en la mezcla del repaso
function rightChoice(item: ReviewItem) {
  return item.question.content.options.indexOf("4");
}

describe("GET /review/today", () => {
  it("pide sesión", async () => {
    expect((await http().get("/review/today")).status).toBe(401);
  });

  it("devuelve null si todavía no jugó ninguna lección", async () => {
    await starWithQuestions(3);
    const { agent } = await student();
    expect(await openReview(agent)).toBeNull();
    expect(await DailyReview.count()).toBe(0);
  });

  it("arma 5 preguntas de lo que jugó: primero las falladas, después las acertadas hace más tiempo", async () => {
    const { questions } = await starWithQuestions(7);
    const { agent, user } = await student();
    const [q0, q1, q2, q3, q4, q5, q6] = questions;
    await answered(user.id, q0!.id, true, 1);
    await answered(user.id, q1!.id, true, 9);
    await answered(user.id, q2!.id, false, 3);
    await answered(user.id, q3!.id, true, 5);
    await answered(user.id, q4!.id, true, 2);
    await answered(user.id, q5!.id, true, 7);
    // q6 no la jugó: no entra

    const review = await openReview(agent);
    const ids = review.questions.map((q: ReviewItem) => q.question.id);
    expect(ids).toEqual([q2!.id, q1!.id, q5!.id, q3!.id, q4!.id]);
    expect(ids).not.toContain(q6!.id);
    expect(review).toMatchObject({ day: today(), total: 5, correctCount: 0, finished: false });
    expect(review.questions[0]).toMatchObject({ position: 1, answered: false, correct: null });
    // Sin respuesta ni explicación
    expect(review.questions[0].question).not.toHaveProperty("answer");
    expect(review.questions[0].question).not.toHaveProperty("explanation");
  });

  it("si jugó menos de 5, trae las que hay; y queda guardado para todo el día", async () => {
    const { questions } = await starWithQuestions(3);
    const { agent, user } = await student();
    await answered(user.id, questions[0]!.id, true);
    await answered(user.id, questions[1]!.id, false);

    const first = await openReview(agent);
    expect(first.total).toBe(2);

    // Aunque juegue otra, el repaso de hoy no cambia
    await answered(user.id, questions[2]!.id, false);
    const again = await openReview(agent);
    expect(again.id).toBe(first.id);
    expect(again.total).toBe(2);
    expect(await DailyReview.count()).toBe(1);
  });

  it("no usa preguntas del banco del examen ni de cursos que no tiene", async () => {
    const { product, questions } = await starWithQuestions(1);
    const bank = await createQuestion({ productId: product.id });
    const { agent, user } = await student();
    await answered(user.id, questions[0]!.id, true);
    await answered(user.id, bank.id, false); // no debería pasar, pero si pasa, no entra

    const review = await openReview(agent);
    expect(review.questions.map((q: ReviewItem) => q.question.id)).toEqual([questions[0]!.id]);
  });
});

describe("POST /reviews/:id/answer", () => {
  async function readyReview(count = 2) {
    const { questions } = await starWithQuestions(count);
    const { agent, user } = await student();
    for (const q of questions) await answered(user.id, q.id, true, 3);
    const review = await openReview(agent);
    return { agent, user, review, questions };
  }

  it("da 404 si el repaso no existe o es de otro alumno", async () => {
    const { agent } = await readyReview();
    expect((await agent.post(`/reviews/${randomUUID()}/answer`).send({ position: 1, response: { choice: 0 } })).status).toBe(404);
    expect((await agent.post("/reviews/no-es-un-id/answer").send({ position: 1, response: { choice: 0 } })).status).toBe(404);

    const other = await DailyReview.create({ userId: (await User.create({ email: "otro@test.com", name: "Otro", alias: "otro" })).id, day: today() });
    expect((await agent.post(`/reviews/${other.id}/answer`).send({ position: 1, response: { choice: 0 } })).status).toBe(404);
  });

  it("corrige con su propia mezcla, da 2 XP por acierto, y 10 XP y 3 destellos por terminarlo", async () => {
    const { agent, user, review } = await readyReview(2);
    const [first, second] = review.questions as ReviewItem[];
    const xpBefore = user.totalXp;

    const right = await agent.post(`/reviews/${review.id}/answer`).send({ position: 1, response: { choice: rightChoice(first!) } });
    expect(right.status).toBe(200);
    expect(right.body).toMatchObject({
      correct: true,
      solution: { choice: rightChoice(first!) },
      output: "4",
      explanation: "2 + 2 es 4.",
      xpGained: 2,
      reviewXp: 0,
      glintsGained: 0,
      glints: 0,
      newBadges: [],
      finished: false,
      correctCount: 1,
      total: 2,
    });

    const wrongChoice = rightChoice(second!) === 0 ? 1 : 0;
    const wrong = await agent.post(`/reviews/${review.id}/answer`).send({ position: 2, response: { choice: wrongChoice } });
    expect(wrong.body).toMatchObject({
      correct: false,
      xpGained: 10,
      reviewXp: 10,
      glintsGained: 3,
      glints: 3,
      finished: true,
      correctCount: 1,
    });

    await user.reload();
    expect(user.totalXp).toBe(xpBefore + 12);
    expect(user.glints).toBe(3);
    expect(await XpEvent.count({ where: { userId: user.id, reason: "review_correct" } })).toBe(1);
    expect(await XpEvent.count({ where: { userId: user.id, reason: "review_completed" } })).toBe(1);
    expect(await Answer.count({ where: { userId: user.id, context: "review" } })).toBe(2);

    const after = await openReview(agent);
    expect(after).toMatchObject({ finished: true, correctCount: 1 });
    expect(after.questions.map((q: { correct: boolean }) => q.correct)).toEqual([true, false]);
  });

  it("cada pregunta se responde una sola vez", async () => {
    const { agent, review } = await readyReview(2);
    const body = { position: 1, response: { choice: 0 } };
    expect((await agent.post(`/reviews/${review.id}/answer`).send(body)).status).toBe(200);
    expect((await agent.post(`/reviews/${review.id}/answer`).send(body)).status).toBe(409);
    expect(await Answer.count({ where: { context: "review" } })).toBe(1);
  });

  it("da 400 si la posición o la respuesta no tienen forma válida", async () => {
    const { agent, review } = await readyReview(2);
    expect((await agent.post(`/reviews/${review.id}/answer`).send({ response: { choice: 0 } })).status).toBe(400);
    expect((await agent.post(`/reviews/${review.id}/answer`).send({ position: 1, response: { choice: 9 } })).status).toBe(400);
    expect((await agent.post(`/reviews/${review.id}/answer`).send({ position: 9, response: { choice: 0 } })).status).toBe(404);
    expect(await Answer.count({ where: { context: "review" } })).toBe(0);
  });

  it("un acierto en el repaso no cuenta para la estrella", async () => {
    const { star, questions } = await starWithQuestions(1);
    const { agent, user } = await student();
    await answered(user.id, questions[0]!.id, false, 2);
    const review = await openReview(agent);

    await agent.post(`/reviews/${review.id}/answer`).send({ position: 1, response: { choice: rightChoice(review.questions[0]) } });

    const starRes = await agent.get(`/stars/${star.id}`);
    expect(starRes.body.questions[0]).toMatchObject({ solved: false, attempt: 1 });
    expect(starRes.body.star.completed).toBe(false);
  });

  it("al otro día, lo acertado en el repaso pierde prioridad", async () => {
    const { questions } = await starWithQuestions(6);
    const { agent, user } = await student();
    for (const q of questions) await answered(user.id, q.id, true, 5);

    const review = await openReview(agent);
    for (const item of review.questions as ReviewItem[]) {
      await agent.post(`/reviews/${review.id}/answer`).send({ position: item.position, response: { choice: rightChoice(item) } });
    }
    // Se pasa el repaso a ayer y se arma el de hoy
    await DailyReview.update({ day: addDays(today(), -1) }, { where: { id: review.id } });
    const reviewed = review.questions.map((q: ReviewItem) => q.question.id);
    const next = await openReview(agent);
    const left = questions.map((q) => q.id).find((id) => !reviewed.includes(id));
    expect(next.questions[0].question.id).toBe(left);
  });
});

describe("la racha", () => {
  it("se registra al responder en el examen", async () => {
    const { agent, user } = await student();
    const { exam } = await createExamReady(user.id);
    const attemptId = (await agent.post(`/exams/${exam.id}/attempts`)).body.attemptId;
    await agent.post(`/exam-attempts/${attemptId}/answer`).send({ position: 1, response: await rightResponse(attemptId, 1) });

    await user.reload();
    expect(user).toMatchObject({ streak: 1, lastActiveOn: today() });
  });

  it("se registra al responder en el repaso", async () => {
    const { questions } = await starWithQuestions(1);
    const { agent, user } = await student();
    await answered(user.id, questions[0]!.id, true, 1);
    const review = await openReview(agent);
    await agent.post(`/reviews/${review.id}/answer`).send({ position: 1, response: { choice: 0 } });

    await user.reload();
    expect(user).toMatchObject({ streak: 1, lastActiveOn: today() });
  });

  it("se registra al responder en una estrella, una vez por día", async () => {
    const { questions } = await starWithQuestions(2);
    const { agent, user } = await student();

    await agent.post(`/questions/${questions[0]!.id}/answer`).send({ response: { choice: 0 } });
    await agent.post(`/questions/${questions[1]!.id}/answer`).send({ response: { choice: 0 } });

    await user.reload();
    expect(user).toMatchObject({ streak: 1, lastActiveOn: today() });
    expect(await DailyActivity.count({ where: { userId: user.id } })).toBe(1);
  });

  it("suma uno si jugó ayer y gasta un protector si faltó un día", async () => {
    const { questions } = await starWithQuestions(1);
    const { agent, user } = await student();
    await user.update({ streak: 6, lastActiveOn: addDays(today(), -2), streakFreezes: 2 });

    await agent.post(`/questions/${questions[0]!.id}/answer`).send({ response: { choice: 0 } });

    await user.reload();
    expect(user).toMatchObject({ streak: 7, lastActiveOn: today() });
    // Si hoy es el primer día del mes, el protector se gastó en el mes anterior y recargó
    const sameMonth = addDays(today(), -1).slice(0, 7) === today().slice(0, 7);
    expect(user.streakFreezes).toBe(sameMonth ? 1 : 2);
  });

  it("la base no acepta una racha negativa ni más de 2 protectores", async () => {
    const { user } = await student();
    await expect(user.update({ streak: -1 })).rejects.toThrow();
    await expect(User.update({ streakFreezes: 3 }, { where: { id: user.id } })).rejects.toThrow();
  });
});

describe("GET /me/stats", () => {
  it("pide sesión", async () => {
    expect((await http().get("/me/stats")).status).toBe(401);
  });

  it("sin actividad: racha 0, 2 protectores y sin repaso", async () => {
    const { agent } = await student();
    const res = await agent.get("/me/stats");
    expect(res.body).toEqual({
      streak: 0,
      streakFreezes: 2,
      boughtFreezes: 0,
      activeToday: false,
      review: { status: "unavailable" },
      glints: 0,
      badges: [],
    });
  });

  it("muestra 0 si la racha se cortó, sin escribir nada", async () => {
    const { agent, user } = await student();
    await user.update({ streak: 9, lastActiveOn: addDays(today(), -10), streakFreezes: 2 });

    const res = await agent.get("/me/stats");
    expect(res.body.streak).toBe(0);
    await user.reload();
    expect(user.streak).toBe(9);
  });

  it("muestra cómo va el repaso de hoy sin armarlo", async () => {
    const { questions } = await starWithQuestions(3);
    const { agent, user } = await student();
    for (const q of questions) await answered(user.id, q.id, true, 2);

    expect((await agent.get("/me/stats")).body.review).toEqual({ status: "pending", answered: 0, total: 3 });
    expect(await DailyReview.count()).toBe(0);

    const review = await openReview(agent);
    await agent.post(`/reviews/${review.id}/answer`).send({ position: 1, response: { choice: 0 } });
    const res = await agent.get("/me/stats");
    expect(res.body).toMatchObject({ streak: 1, activeToday: true, review: { status: "in_progress", answered: 1, total: 3 } });
  });
});
