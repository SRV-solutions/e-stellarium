import { describe, expect, it } from "vitest";
import type { Agent } from "supertest";
import {
  Answer,
  Challenge,
  ChallengeAttempt,
  ChallengeAttemptQuestion,
  DailyActivity,
  Product,
  Question,
  User,
  XpEvent,
} from "../src/models/index.js";
import type { Difficulty } from "../src/models/Question.js";
import { latestSlot, nextSlot, planChallenge, type Candidate } from "../src/games/challenge.js";
import { createUser, http, loginAs, provision } from "./helpers.js";

// ---------- Funciones puras ----------

describe("cuándo sale el desafío", () => {
  it("el último publicado es el lunes o el sábado a las 9:00 de Argentina más reciente", () => {
    // Miércoles 11 de noviembre → lunes 9 a las 9:00 (12:00 UTC)
    expect(latestSlot(new Date("2026-11-11T15:00:00Z"))).toEqual(new Date("2026-11-09T12:00:00Z"));
    // El lunes a las 8:59 todavía vale el del sábado
    expect(latestSlot(new Date("2026-11-09T11:59:00Z"))).toEqual(new Date("2026-11-07T12:00:00Z"));
    // A las 9:00 en punto ya salió el nuevo
    expect(latestSlot(new Date("2026-11-09T12:00:00Z"))).toEqual(new Date("2026-11-09T12:00:00Z"));
  });

  it("cierra cuando sale el siguiente", () => {
    expect(nextSlot(new Date("2026-11-09T12:00:00Z"))).toEqual(new Date("2026-11-14T12:00:00Z"));
    expect(nextSlot(new Date("2026-11-14T12:00:00Z"))).toEqual(new Date("2026-11-16T12:00:00Z"));
  });
});

describe("la receta", () => {
  let n = 0;
  function candidate(productId: string, difficulty: Difficulty, extra: Partial<Candidate> = {}): Candidate {
    n++;
    return { id: `q${n}`, productId, difficulty, type: "output", seen: false, failed: false, lastSeenAt: null, ...extra };
  }
  function many(productId: string, difficulty: Difficulty, count: number) {
    return Array.from({ length: count }, () => candidate(productId, difficulty));
  }
  const python = [...many("py", "easy", 4), ...many("py", "medium", 4), ...many("py", "hard", 4)];
  const js = [...many("js", "easy", 5), ...many("js", "medium", 2)];
  const byId = new Map([...python, ...js].map((c) => [c.id, c]));

  it("arma 6 de sus cursos (2 fáciles, 2 medias, 2 difíciles), 3 de Explorá y 1 de Descubrí", () => {
    const plan = planChallenge(["py"], [...python, ...js], "semilla");
    expect(plan.questions.map((q) => q.part)).toEqual([
      ...Array(6).fill("own"),
      ...Array(3).fill("explore"),
      "discover",
    ]);
    const own = plan.questions.filter((q) => q.part === "own").map((q) => byId.get(q.questionId)!);
    expect(own.every((c) => c.productId === "py")).toBe(true);
    expect(own.map((c) => c.difficulty).sort()).toEqual(["easy", "easy", "hard", "hard", "medium", "medium"]);
    const explore = plan.questions.filter((q) => q.part === "explore").map((q) => byId.get(q.questionId)!);
    expect(explore.map((c) => c.difficulty).sort()).toEqual(["easy", "easy", "medium"]);
    expect(plan.exploreProductId).toBe("js");
    expect(new Set(plan.questions.map((q) => q.questionId)).size).toBe(10);
  });

  it("la misma semilla da lo mismo; otra semilla, otro orden", () => {
    const a = planChallenge(["py"], [...python, ...js], "uno");
    expect(planChallenge(["py"], [...python, ...js], "uno")).toEqual(a);
    const b = planChallenge(["py"], [...python, ...js], "dos");
    expect(b.questions.map((q) => q.questionId)).not.toEqual(a.questions.map((q) => q.questionId));
  });

  it("repasa hasta 2 que falló, y prefiere las que nunca vio a las que ya acertó", () => {
    const failed = [
      candidate("py", "easy", { seen: true, failed: true, lastSeenAt: new Date("2026-11-01") }),
      candidate("py", "hard", { seen: true, failed: true, lastSeenAt: new Date("2026-11-02") }),
      candidate("py", "medium", { seen: true, failed: true, lastSeenAt: new Date("2026-11-03") }),
    ];
    const right = many("py", "easy", 3).map((c) => ({ ...c, seen: true, lastSeenAt: new Date("2026-10-01") }));
    const fresh = [...many("py", "easy", 4), ...many("py", "medium", 3), ...many("py", "hard", 2)];
    const plan = planChallenge(["py"], [...failed, ...right, ...fresh], "s");
    const ids = plan.questions.map((q) => q.questionId);

    // Las dos que falló hace más tiempo; la tercera no entra (el repaso es de 2)
    expect(ids).toContain(failed[0]!.id);
    expect(ids).toContain(failed[1]!.id);
    expect(ids).not.toContain(failed[2]!.id);
    expect(ids.some((id) => right.some((c) => c.id === id))).toBe(false);
    // Sin otro curso, los 10 lugares son de sus cursos
    expect(plan.questions.every((q) => q.part === "own")).toBe(true);
    expect(plan.exploreProductId).toBeNull();
  });

  it("si falta una dificultad, usa la más cercana; si no tiene preguntas en sus cursos, no arma nada", () => {
    const onlyEasyAndMedium = [...many("py", "easy", 5), ...many("py", "medium", 5)];
    const plan = planChallenge(["py"], onlyEasyAndMedium, "s");
    expect(plan.questions).toHaveLength(10);

    expect(planChallenge(["otro"], [...python, ...js], "s").questions).toEqual([]);
  });
});

// ---------- Endpoints ----------

async function productId(key: string) {
  return (await Product.findOne({ where: { key } }))!.id;
}

// `count` preguntas de desafío de un curso, de "¿Qué imprime?", con la correcta "4"
async function challengeQuestions(courseKey: string, count: number, difficulty: Difficulty = "easy") {
  const id = await productId(courseKey);
  for (let i = 0; i < count; i++) {
    await Question.create({
      productId: id,
      pool: "challenge",
      type: "output",
      difficulty,
      topic: "desafío",
      prompt: "¿Qué imprime este código?",
      content: { code: "print(2 + 2)", options: ["4", "22", "2 + 2", "Error"] },
      answer: { correct: 0 },
      explanation: "2 + 2 es 4.",
      status: "published",
    });
  }
}

async function fullBank() {
  await challengeQuestions("python", 4, "easy");
  await challengeQuestions("python", 4, "medium");
  await challengeQuestions("python", 4, "hard");
  await challengeQuestions("fundamentos-backend", 5, "easy");
}

// Cada alumno con su propio pago, para que la provisión no lo tome como repetido
let payment = 5000;
async function student(email = "alumno@test.com") {
  await createUser(email);
  await provision({ email, name: "Alumno", paymentId: String(++payment), courses: ["python"] });
  const agent = await loginAs(email);
  const user = (await User.findOne({ where: { email } }))!;
  return { agent, user };
}

type Step = { position: number; question: { content: { options: string[] } } };
const right = (step: Step) => ({ choice: step.question.content.options.indexOf("4") });
const wrong = (step: Step) => ({ choice: step.question.content.options.indexOf("22") });

async function current(agent: Agent) {
  const res = await agent.get("/challenges/current");
  expect(res.status).toBe(200);
  return res.body;
}

describe("GET /challenges/current", () => {
  it("pide sesión", async () => {
    expect((await http().get("/challenges/current")).status).toBe(401);
  });

  it("si no hay preguntas de desafío para sus cursos, no está disponible", async () => {
    await challengeQuestions("fundamentos-backend", 5); // solo de un curso que no tiene
    await challengeQuestions("python", 3);
    await Question.update({ status: "draft" }, { where: { productId: await productId("python") } });
    const { agent } = await student();
    const body = await current(agent);
    expect(body.status).toBe("unavailable");
    expect(await ChallengeAttempt.count()).toBe(0);
  });

  it("lo arma la primera vez, sin respuestas, y queda guardado", async () => {
    await fullBank();
    const { agent } = await student();

    const first = await current(agent);
    expect(first).toMatchObject({
      status: "ready",
      total: 10,
      parts: { own: 6, explore: 3, discover: 1 },
      explore: { key: "fundamentos-backend", name: "Master en JavaScript" },
      discover: { key: "fundamentos-backend", name: "Master en JavaScript" }, // no hay un tercer curso
      current: null,
      result: null,
    });
    expect(new Date(first.challenge.closesAt).getTime()).toBeGreaterThan(Date.now());
    expect(JSON.stringify(first)).not.toContain('"answer"');

    const again = await current(agent);
    expect(again.challenge.id).toBe(first.challenge.id);
    expect(await ChallengeAttempt.count()).toBe(1);
    expect(await ChallengeAttemptQuestion.count()).toBe(10);
  });

  it("todos los alumnos comparten el desafío, pero cada uno tiene el suyo", async () => {
    await fullBank();
    const a = await student("a@test.com");
    const b = await student("b@test.com");
    const ca = await current(a.agent);
    const cb = await current(b.agent);
    expect(ca.challenge.id).toBe(cb.challenge.id);
    expect(await ChallengeAttempt.count()).toBe(2);
  });
});

describe("jugar un desafío", () => {
  async function started() {
    await fullBank();
    const { agent, user } = await student();
    const { challenge } = await current(agent);
    const res = await agent.post(`/challenges/${challenge.id}/start`);
    expect(res.status).toBe(200);
    return { agent, user, id: challenge.id as string, body: res.body };
  }

  it("Empezar arranca el reloj y muestra la primera pregunta", async () => {
    const { body } = await started();
    expect(body.status).toBe("in_progress");
    expect(body.current).toMatchObject({ position: 1, total: 10, part: "own", timeLimitSeconds: 30 });
    expect(body.current.remainingMs).toBeGreaterThan(25_000);
    expect(body.current.question).not.toHaveProperty("answer");
  });

  it("no se puede responder antes de empezar", async () => {
    await fullBank();
    const { agent } = await student();
    const { challenge } = await current(agent);
    const res = await agent.post(`/challenges/${challenge.id}/answer`).send({ position: 1, response: { choice: 0 } });
    expect(res.status).toBe(409);
  });

  it("responder corrige, da XP, anota la respuesta y mantiene la racha", async () => {
    const { agent, user, id, body } = await started();

    const res = await agent.post(`/challenges/${id}/answer`).send({ position: 1, response: right(body.current) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ correct: true, timedOut: false, xpGained: 5, finished: false, explanation: "2 + 2 es 4." });

    expect(await Answer.count({ where: { userId: user.id, context: "challenge" } })).toBe(1);
    expect(await DailyActivity.count({ where: { userId: user.id } })).toBe(1);
    expect((await User.findByPk(user.id))!.totalXp).toBe(5);

    // No se responde dos veces, ni una que todavía no le tocó
    const again = await agent.post(`/challenges/${id}/answer`).send({ position: 1, response: right(body.current) });
    expect(again.status).toBe(409);
    const ahead = await agent.post(`/challenges/${id}/answer`).send({ position: 3, response: { choice: 0 } });
    expect(ahead.status).toBe(409);

    // La siguiente se muestra recién al pedirla
    const next = await current(agent);
    expect(next.current.position).toBe(2);
    // Al retomar, sabe cuáles respondió, sin las respuestas
    expect(next.questions.slice(0, 2)).toEqual([
      { part: "own", correct: true },
      { part: "own", correct: null },
    ]);
  });

  it("si se le venció el tiempo, cuenta como mal", async () => {
    const { agent, id } = await started();
    const row = await ChallengeAttemptQuestion.findOne({ where: { position: 1 } });
    await row!.update({ deadlineAt: new Date(Date.now() - 10_000) });

    const res = await agent.post(`/challenges/${id}/answer`).send({ position: 1, response: { choice: 0 } });
    expect(res.body).toMatchObject({ correct: false, timedOut: true, xpGained: 0 });
    expect(await Answer.count()).toBe(0);
  });

  it("al responder la última, termina: resultado, XP por terminar y recomendación; no se juega dos veces", async () => {
    const { agent, user, id } = await started();

    let last;
    for (let i = 0; i < 10; i++) {
      const { current: step } = await current(agent);
      const response = i < 7 ? right(step) : wrong(step);
      last = (await agent.post(`/challenges/${id}/answer`).send({ position: step.position, response })).body;
    }

    expect(last).toMatchObject({ finished: true, xpGained: 20 });
    expect(last.result).toMatchObject({
      correctCount: 7,
      total: 10,
      xpGained: 7 * 5 + 20,
      recommendation: { key: "fundamentos-backend", name: "Master en JavaScript" },
    });
    expect(last.result.results).toHaveLength(10);
    expect((await User.findByPk(user.id))!.totalXp).toBe(55);
    expect(await XpEvent.count({ where: { reason: "challenge_completed" } })).toBe(1);

    const view = await current(agent);
    expect(view.status).toBe("finished");
    expect((await agent.post(`/challenges/${id}/start`)).status).toBe(409);
  });

  it("da 404 con un id inválido o de un desafío que no es suyo", async () => {
    const { agent } = await started();
    expect((await agent.post("/challenges/no-es-un-id/start")).status).toBe(404);
    const other = await student("otro@test.com");
    expect((await other.agent.post("/challenges/00000000-0000-4000-8000-000000000000/start")).status).toBe(404);
  });

  // Pasa el desafío a la semana pasada: el próximo pedido arma uno nuevo
  async function closeChallenge(id: string) {
    const day = 24 * 60 * 60 * 1000;
    await Challenge.update(
      { publishedAt: new Date(Date.now() - 10 * day), closesAt: new Date(Date.now() - 3 * day) },
      { where: { id } }
    );
  }

  it("el próximo desafío no repite la que acertó, y vuelve a traer la que falló", async () => {
    const { agent, id, body } = await started();
    const firstId = (await ChallengeAttemptQuestion.findOne({ where: { position: 1 } }))!.questionId;
    await agent.post(`/challenges/${id}/answer`).send({ position: 1, response: right(body.current) });
    await closeChallenge(id);

    const second = await current(agent);
    expect(second.challenge.id).not.toBe(id);
    const secondIds = (await ChallengeAttemptQuestion.findAll({ include: [{ model: ChallengeAttempt, where: { challengeId: second.challenge.id } }] })).map((r) => r.questionId);
    expect(secondIds).not.toContain(firstId);
  });

  it("la que falló vuelve como repaso en el próximo", async () => {
    const { agent, id, body } = await started();
    const firstId = (await ChallengeAttemptQuestion.findOne({ where: { position: 1 } }))!.questionId;
    await agent.post(`/challenges/${id}/answer`).send({ position: 1, response: wrong(body.current) });
    await closeChallenge(id);

    const second = await current(agent);
    const secondIds = (await ChallengeAttemptQuestion.findAll({ include: [{ model: ChallengeAttempt, where: { challengeId: second.challenge.id } }] })).map((r) => r.questionId);
    expect(secondIds).toContain(firstId);
  });
});
