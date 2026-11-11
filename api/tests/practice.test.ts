import { describe, expect, it } from "vitest";
import { DailyActivity, ExamAttempt, Question, User } from "../src/models/index.js";
import { grade } from "../src/games/grade.js";
import { practiceSeed } from "../src/games/practice.js";
import { createExamReady, createQuestion, enrolledStudent } from "./helpers.js";

// Un alumno de Python con el examen listo. Si `passed`, ya lo aprobó (un intento terminado con 8 de 10).
// Además del banco del examen, el curso tiene preguntas para practicar: 7 en la lección y 3 en los desafíos
async function practiceStudent({ passed = true } = {}) {
  const agent = await enrolledStudent();
  const user = (await User.findOne({ where: { email: "alumno@test.com" } }))!;
  const ready = await createExamReady(user.id);
  const { product, lesson, exam } = ready;

  for (let position = 1; position <= 7; position++) {
    await createQuestion({ productId: product.id, starId: lesson.id, position });
  }
  const common = { productId: product.id, pool: "challenge" as const, difficulty: "easy" as const, topic: "desafío", explanation: "Así.", status: "published" as const };
  await Question.create({ ...common, type: "fill_blank", prompt: "Completá", content: { code: "print(___)", blanks: [["1", "x"]] }, answer: { correct: [0], output: "1" } });
  await Question.create({ ...common, type: "order_lines", prompt: "Ordená", content: { lines: ["a = 1", "print(a)"] }, answer: { order: [0, 1], output: "1" } });
  await Question.create({ ...common, type: "multiple_choice", prompt: "¿Cuál?", content: { options: ["1", "uno"] }, answer: { correct: 0 } });

  if (passed) {
    await ExamAttempt.create({ userId: user.id, starId: exam.id, number: 1, finishedAt: new Date(), correctCount: 8, passed: true });
  }
  return { agent, user, ...ready };
}

// La respuesta correcta en las posiciones de la pantalla, con la mezcla de esa práctica
async function rightResponse(userId: string, practiceId: string, questionId: string) {
  const q = (await Question.scope("withAnswer").findByPk(questionId))!;
  const probe =
    q.type === "fill_blank" ? { choices: [0] } : q.type === "order_lines" ? { order: [0, 1] } : { choice: 0 };
  return grade(q, practiceSeed(userId, practiceId, q.id), probe).solution;
}

describe("la práctica del examen", () => {
  it("se abre solo si aprobó el examen", async () => {
    const { agent, exam } = await practiceStudent({ passed: false });

    const res = await agent.post(`/exams/${exam.id}/practice`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/aprobás el examen/);
  });

  it("sortea 10 de las lecciones y los desafíos, nunca del banco, y sin las respuestas", async () => {
    const { agent, exam } = await practiceStudent();

    const res = await agent.post(`/exams/${exam.id}/practice`);
    expect(res.status).toBe(201);
    expect(res.body.practiceId).toMatch(/^[0-9a-f]{16}$/);
    expect(res.body.questions).toHaveLength(10);

    const ids = res.body.questions.map((q: { id: string }) => q.id);
    const drawn = await Question.findAll({ where: { id: ids } });
    expect(drawn.every((q) => q.pool !== "exam")).toBe(true);
    expect(new Set(drawn.map((q) => q.type)).size).toBe(4);
    expect(JSON.stringify(res.body)).not.toContain('"answer"');
    expect(JSON.stringify(res.body)).not.toContain('"explanation"');
  });

  it("corrige con la mezcla de esa práctica, muestra la correcta y cuenta para la racha, sin XP", async () => {
    const { agent, user, exam } = await practiceStudent();
    const { practiceId, questions } = (await agent.post(`/exams/${exam.id}/practice`)).body;
    const [first, second] = questions;

    const right = await rightResponse(user.id, practiceId, first.id);
    let res = await agent.post(`/exams/${exam.id}/practice/answer`).send({ practiceId, questionId: first.id, response: right });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ correct: true, solution: right, explanation: expect.any(String), streak: 1 });

    const solution = await rightResponse(user.id, practiceId, second.id);
    const wrong =
      "choice" in solution
        ? { choice: solution.choice === 0 ? 1 : 0 }
        : "choices" in solution
          ? { choices: solution.choices.map((c) => (c === 0 ? 1 : 0)) }
          : { order: [...solution.order].reverse() };
    res = await agent.post(`/exams/${exam.id}/practice/answer`).send({ practiceId, questionId: second.id, response: wrong });
    expect(res.body).toMatchObject({ correct: false, solution });

    expect(await DailyActivity.count({ where: { userId: user.id } })).toBe(1);
    await user.reload();
    expect(user.totalXp).toBe(0);
  });

  it("no corrige preguntas del banco del examen ni datos inválidos", async () => {
    const { agent, exam } = await practiceStudent();
    const { practiceId } = (await agent.post(`/exams/${exam.id}/practice`)).body;
    const bank = (await Question.findOne({ where: { pool: "exam" } }))!;

    let res = await agent.post(`/exams/${exam.id}/practice/answer`).send({ practiceId, questionId: bank.id, response: { choice: 0 } });
    expect(res.status).toBe(404);

    res = await agent.post(`/exams/${exam.id}/practice/answer`).send({ practiceId: "otra-cosa", questionId: bank.id, response: { choice: 0 } });
    expect(res.status).toBe(400);
  });

  it("GET /constellations dice cuántas preguntas hay para practicar", async () => {
    const { agent } = await practiceStudent();

    const [python] = (await agent.get("/constellations")).body.constellations;
    const examStar = python.stars.find((s: { kind: string }) => s.kind === "exam");
    expect(examStar.exam).toMatchObject({ status: "passed", practiceCount: 10 });
  });
});
