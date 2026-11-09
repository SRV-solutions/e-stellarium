import { describe, expect, it } from "vitest";
import { Coupon, ExamAttempt, ExamAttemptQuestion, Question, StarCompletion, User } from "../src/models/index.js";
import { answerQuestion, getProgress, startAttempt, type ExamProgress } from "../src/games/examFlow.js";
import { examSeed } from "../src/games/exam.js";
import { grade } from "../src/games/grade.js";
import { createExamReady, createUser } from "./helpers.js";

// Una respuesta con la forma correcta para cada juego (no necesariamente acertada)
function anyResponse(q: Question) {
  if (q.type === "fill_blank") return { choices: (q.content as { blanks: string[][] }).blanks.map(() => 0) };
  if (q.type === "order_lines") return { order: (q.content as { lines: string[] }).lines.map((_, i) => i) };
  return { choice: 0 };
}

// La respuesta correcta, en las posiciones de la pantalla del alumno (lo que devuelve grade como solución)
async function rightResponse(attemptId: string, position: number) {
  const row = await ExamAttemptQuestion.findOne({ where: { attemptId, position } });
  const q = await Question.scope("withAnswer").findByPk(row!.questionId);
  return grade(q!, examSeed(attemptId, q!.id), anyResponse(q!)).solution;
}

async function wrongResponse(attemptId: string, position: number) {
  const right = await rightResponse(attemptId, position);
  if ("choice" in right) return { choice: right.choice === 0 ? 1 : 0 };
  if ("choices" in right) return { choices: right.choices.map((c) => (c === 0 ? 1 : 0)) };
  return { order: [...right.order].reverse() };
}

async function setup() {
  const user = await createUser();
  const { exam } = await createExamReady(user.id);
  const attempt = await startAttempt(user.id, exam);
  return { user, exam, attempt };
}

const later = (from: Date, seconds: number) => new Date(from.getTime() + seconds * 1000);

describe("empezar un intento de examen", () => {
  it("sortea 10 preguntas del banco, con el reloj todavía parado", async () => {
    const { attempt } = await setup();
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

describe("rendir el examen", () => {
  it("aprobado: enciende la estrella, da 100 XP y un cupón de 60 %", async () => {
    const { user, exam, attempt } = await setup();
    let now = new Date();

    let progress: ExamProgress = await getProgress(user.id, attempt.id, now);
    for (let position = 1; position <= 10; position++) {
      expect(progress).toMatchObject({ status: "question", position });
      now = later(now, 5);
      const response = position <= 7 ? await rightResponse(attempt.id, position) : await wrongResponse(attempt.id, position);
      progress = await answerQuestion(user.id, attempt.id, position, response, now);
    }

    expect(progress).toMatchObject({ status: "finished", correctCount: 7, passed: true, xpGained: 100, retryOpensAt: null });
    if (progress.status !== "finished") throw new Error();
    expect(progress.results).toEqual([true, true, true, true, true, true, true, false, false, false]);
    expect(progress.coupon).toMatchObject({ percent: 60 });
    expect(progress.coupon!.code).toMatch(/^ESTL-PY-/);

    expect(await StarCompletion.count({ where: { userId: user.id, starId: exam.id } })).toBe(1);
    expect((await User.findByPk(user.id))!.totalXp).toBe(100);
    expect(await Coupon.count()).toBe(1);

    // Volver a pedirlo da el mismo resultado, sin dar otro cupón
    expect(await getProgress(user.id, attempt.id)).toEqual(progress);
    expect(await Coupon.count()).toBe(1);
  });

  it("no aprobado con 6: sin cupón ni estrella, y reintento a los 2 días", async () => {
    const { user, exam, attempt } = await setup();
    const now = new Date();
    await getProgress(user.id, attempt.id, now);

    let progress: ExamProgress | undefined;
    for (let position = 1; position <= 10; position++) {
      const response = position <= 6 ? await rightResponse(attempt.id, position) : await wrongResponse(attempt.id, position);
      progress = await answerQuestion(user.id, attempt.id, position, response, now);
    }

    expect(progress).toMatchObject({ status: "finished", correctCount: 6, passed: false, coupon: null, xpGained: 0 });
    expect(progress!.status === "finished" && progress!.retryOpensAt).toEqual(later(now, 2 * 24 * 60 * 60));
    expect(await StarCompletion.count({ where: { starId: exam.id } })).toBe(0);
    expect(await Coupon.count()).toBe(0);
  });

  it("recargar no reinicia el reloj, y una respuesta tardía no cuenta", async () => {
    const { user, attempt } = await setup();
    const t0 = new Date();

    const first = await getProgress(user.id, attempt.id, t0);
    if (first.status !== "question") throw new Error();
    const again = await getProgress(user.id, attempt.id, later(t0, 5));
    expect(again).toMatchObject({ position: 1, remainingMs: first.remainingMs - 5000 });

    // Responde bien, pero 3 segundos después del límite (el margen es de 2)
    const tooLate = later(t0, first.timeLimitSeconds + 3);
    const next = await answerQuestion(user.id, attempt.id, 1, await rightResponse(attempt.id, 1), tooLate);
    expect(next).toMatchObject({ status: "question", position: 2 });

    const row = await ExamAttemptQuestion.findOne({ where: { attemptId: attempt.id, position: 1 } });
    expect(row).toMatchObject({ correct: false, response: null });
  });

  it("si se va, el reloj sigue: al volver una hora después, todo venció", async () => {
    const { user, attempt } = await setup();
    const t0 = new Date();
    await getProgress(user.id, attempt.id, t0);

    const progress = await getProgress(user.id, attempt.id, later(t0, 3600));
    expect(progress).toMatchObject({ status: "finished", correctCount: 0, passed: false });
  });

  it("no deja ver ni responder el intento de otro alumno", async () => {
    const { attempt } = await setup();
    const other = await createUser("otro@test.com");

    await expect(getProgress(other.id, attempt.id)).rejects.toMatchObject({ status: 404 });
    await expect(answerQuestion(other.id, attempt.id, 1, { choice: 0 })).rejects.toMatchObject({ status: 404 });
  });

  it("una respuesta con forma inválida da 400", async () => {
    const { user, attempt } = await setup();
    await getProgress(user.id, attempt.id);
    await expect(answerQuestion(user.id, attempt.id, 1, { nada: true })).rejects.toMatchObject({ status: 400 });
  });
});
