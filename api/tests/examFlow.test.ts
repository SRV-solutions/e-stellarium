import { describe, expect, it } from "vitest";
import { ExamAttempt, ExamAttemptQuestion, Question } from "../src/models/index.js";
import { startAttempt } from "../src/games/examFlow.js";
import { createExamReady, createUser } from "./helpers.js";

describe("empezar un intento de examen", () => {
  it("sortea 10 preguntas del banco, con el reloj todavía parado", async () => {
    const user = await createUser();
    const { exam } = await createExamReady(user.id);

    const attempt = await startAttempt(user.id, exam);
    expect(attempt.number).toBe(1);

    const rows = await ExamAttemptQuestion.findAll({ where: { attemptId: attempt.id }, include: [Question] });
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.Question!.starId === null)).toBe(true);
    expect(new Set(rows.map((r) => r.Question!.type)).size).toBe(4);
    expect(rows.every((r) => r.shownAt === null)).toBe(true);
  });

  it("si ya tiene uno en curso, devuelve ese en vez de crear otro", async () => {
    const user = await createUser();
    const { exam } = await createExamReady(user.id);

    const [a, b] = await Promise.all([startAttempt(user.id, exam), startAttempt(user.id, exam)]);
    expect(a.id).toBe(b.id);
    expect(await ExamAttempt.count()).toBe(1);
  });

  it("no deja empezar antes de los 3 días", async () => {
    const user = await createUser();
    const { exam } = await createExamReady(user.id, 1);

    await expect(startAttempt(user.id, exam)).rejects.toMatchObject({ status: 409 });
    expect(await ExamAttempt.count()).toBe(0);
  });
});
