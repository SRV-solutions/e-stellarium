import type { Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { couponEmail } from "../lib/email.js";
import { sendMail } from "../lib/mailer.js";
import {
  Constellation,
  Coupon,
  ExamAttempt,
  ExamAttemptQuestion,
  Product,
  Question,
  Star,
  StarCompletion,
  User,
} from "../models/index.js";
import {
  couponExpiresAt,
  couponPercent,
  deadlineFor,
  drawExamQuestions,
  examSeed,
  generateCouponCode,
  hasPassed,
  isLate,
  retryOpensAt,
  SECONDS_PER_TYPE,
} from "./exam.js";
import { getExamState } from "./examState.js";
import { grade, InvalidResponseError } from "./grade.js";
import { present, type StudentQuestion } from "./present.js";
import { awardXp, XP } from "./progress.js";
import { recordActivity } from "./activity.js";

export type ExamCoupon = { code: string; percent: number; expiresAt: Date };

// Lo que recibe el navegador: la pregunta que toca, o el resultado si ya terminó
export type ExamProgress =
  | {
      status: "question";
      attemptId: string;
      position: number;
      total: number;
      timeLimitSeconds: number;
      remainingMs: number; // en milisegundos, para no depender del reloj del navegador
      question: StudentQuestion;
    }
  | {
      status: "finished";
      attemptId: string;
      total: number;
      correctCount: number;
      passed: boolean;
      results: boolean[]; // bien o mal en cada lugar, sin decir cuál era la respuesta
      xpGained: number;
      coupon: ExamCoupon | null;
      retryOpensAt: Date | null;
    };

type Row = ExamAttemptQuestion & { Question: Question };

// Empieza un intento: sortea las preguntas y las guarda. Si ya tenía uno en curso, devuelve ese.
// El reloj todavía no corre: arranca cuando se le muestra la primera pregunta.
export async function startAttempt(userId: string, exam: Star): Promise<ExamAttempt> {
  return sequelize.transaction(async (t) => {
    // Bloquea al alumno: si aprieta "Empezar" dos veces, el segundo pedido espera al primero
    await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });

    const state = await getExamState(userId, exam, new Date(), t);
    if (state.status === "in_progress") {
      return (await ExamAttempt.findByPk(state.attemptId, { transaction: t }))!;
    }
    if (state.status !== "open") throw new HttpError(409, "El examen todavía no está abierto");

    const constellation = await Constellation.findByPk(exam.constellationId, { transaction: t });
    const bank = await Question.findAll({
      attributes: ["id", "type"],
      where: { productId: constellation!.productId, starId: null, status: "published" },
      transaction: t,
    });

    const attempt = await ExamAttempt.create(
      { userId, starId: exam.id, number: state.attempts + 1 },
      { transaction: t }
    );

    let questionIds: string[];
    try {
      questionIds = drawExamQuestions(bank, attempt.id);
    } catch {
      throw new HttpError(409, "Este examen todavía no tiene suficientes preguntas");
    }

    await ExamAttemptQuestion.bulkCreate(
      questionIds.map((questionId, i) => ({ attemptId: attempt.id, questionId, position: i + 1 })),
      { transaction: t }
    );

    return attempt;
  });
}

// La pregunta que toca ahora, o el resultado. Al pedirla se muestra, y su reloj empieza a correr.
export async function getProgress(userId: string, attemptId: string, now = new Date()) {
  return sequelize.transaction(async (t) => {
    const { user, attempt } = await lockAttempt(userId, attemptId, t);
    if (attempt.finishedAt) return buildResult(attempt, t);

    const rows = await loadRows(attempt.id, t);
    const current = await advance(rows, now, t);
    if (!current) return finish(user, attempt, rows, now, t);
    return buildQuestion(attempt, rows.length, current, now);
  });
}

// Responde la pregunta en `position`. Devuelve lo mismo que getProgress: la que sigue, o el resultado.
// Si llega tarde (o es una pregunta que ya pasó), no cuenta y se devuelve la que toca ahora.
export async function answerQuestion(
  userId: string,
  attemptId: string,
  position: number,
  response: unknown,
  now = new Date()
): Promise<ExamProgress> {
  return sequelize.transaction(async (t) => {
    const { user, attempt } = await lockAttempt(userId, attemptId, t);
    if (attempt.finishedAt) return buildResult(attempt, t);

    const rows = await loadRows(attempt.id, t);
    let current = await advance(rows, now, t);
    await recordActivity(user, now, t);

    if (current && current.position === position) {
      const question = await Question.scope("withAnswer").findByPk(current.questionId, { transaction: t });
      let correct: boolean;
      try {
        correct = grade(question!, examSeed(attempt.id, question!.id), response).correct;
      } catch (err) {
        if (err instanceof InvalidResponseError) {
          throw new HttpError(400, "La respuesta no tiene un formato válido.");
        }
        throw err;
      }
      await current.update({ correct, response: response as object, answeredAt: now }, { transaction: t });
      current = await advance(rows, now, t);
    }

    if (!current) return finish(user, attempt, rows, now, t);
    return buildQuestion(attempt, rows.length, current, now);
  });
}

// Bloquea al alumno y al intento, en ese orden, y verifica que el intento sea suyo
async function lockAttempt(userId: string, attemptId: string, t: Transaction) {
  const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
  const attempt = await ExamAttempt.findOne({
    where: { id: attemptId, userId },
    lock: t.LOCK.UPDATE,
    transaction: t,
  });
  if (!user || !attempt) throw new HttpError(404, "No encontramos ese examen.");
  return { user, attempt };
}

async function loadRows(attemptId: string, t: Transaction) {
  return (await ExamAttemptQuestion.findAll({
    where: { attemptId },
    include: [Question],
    order: [["position", "ASC"]],
    transaction: t,
  })) as Row[];
}

// Avanza el reloj hasta `now` y devuelve la pregunta que toca, o null si ya no queda ninguna.
// El reloj sigue aunque el alumno se vaya: si se le venció una pregunta, cuenta como mal y la
// siguiente se considera mostrada en el momento en que venció la anterior.
async function advance(rows: Row[], now: Date, t: Transaction): Promise<Row | null> {
  let carry: Date | null = null; // cuándo venció la anterior, si se venció sin respuesta

  for (const row of rows) {
    if (row.correct !== null) continue; // ya respondida o vencida

    if (!row.shownAt) {
      const shownAt: Date = carry ?? now;
      await row.update(
        { shownAt, deadlineAt: deadlineFor(row.Question.type, shownAt) },
        { transaction: t }
      );
    }

    if (!isLate(row.deadlineAt!, now)) return row;

    await row.update({ correct: false }, { transaction: t });
    carry = row.deadlineAt!;
  }

  return null;
}

function buildQuestion(attempt: ExamAttempt, total: number, row: Row, now: Date): ExamProgress {
  return {
    status: "question",
    attemptId: attempt.id,
    position: row.position,
    total,
    timeLimitSeconds: SECONDS_PER_TYPE[row.Question.type],
    remainingMs: Math.max(0, row.deadlineAt!.getTime() - now.getTime()),
    question: present(row.Question, examSeed(attempt.id, row.questionId)),
  };
}

// Cierra el intento. Si aprobó: enciende la estrella de examen, da la experiencia y el cupón.
async function finish(user: User, attempt: ExamAttempt, rows: Row[], now: Date, t: Transaction) {
  const correctCount = rows.filter((r) => r.correct).length;
  const passed = hasPassed(correctCount);
  await attempt.update({ finishedAt: now, correctCount, passed }, { transaction: t });

  if (passed) {
    await StarCompletion.findOrCreate({ where: { userId: user.id, starId: attempt.starId }, transaction: t });
    await awardXp(user, "exam_passed", attempt.starId, XP.examPassed, t);

    const star = await Star.findByPk(attempt.starId, {
      include: [{ model: Constellation, include: [Product] }],
      transaction: t,
    });
    const constellation = star!.Constellation!;
    const earned = await Coupon.count({ where: { userId: user.id }, transaction: t });

    const coupon = await Coupon.create(
      {
        code: await uniqueCouponCode(constellation.Product!.key, t),
        percent: couponPercent(earned),
        expiresAt: couponExpiresAt(now),
        userId: user.id,
        constellationId: constellation.id,
        examAttemptId: attempt.id,
      },
      { transaction: t }
    );

    // El mail, solo si la transacción se guardó
    const mail = couponEmail(user.name, constellation.Product!.name, coupon.code, coupon.percent, coupon.expiresAt);
    t.afterCommit(() => {
      sendMail({ to: user.email, ...mail }).catch((err) => console.error("No se pudo enviar el mail del cupón", err));
    });
  }

  return buildResult(attempt, t, rows);
}

// Un código que no exista todavía. Con 6 caracteres casi nunca hace falta un segundo intento.
async function uniqueCouponCode(courseKey: string, t: Transaction) {
  for (let i = 0; i < 5; i++) {
    const code = generateCouponCode(courseKey);
    if (!(await Coupon.findOne({ where: { code }, transaction: t }))) return code;
  }
  throw new Error("No se pudo generar un código de cupón único");
}

async function buildResult(attempt: ExamAttempt, t: Transaction, rows?: Row[]): Promise<ExamProgress> {
  rows ??= await loadRows(attempt.id, t);
  const coupon = await Coupon.findOne({ where: { examAttemptId: attempt.id }, transaction: t });

  return {
    status: "finished",
    attemptId: attempt.id,
    total: rows.length,
    correctCount: attempt.correctCount!,
    passed: attempt.passed!,
    results: rows.map((r) => r.correct === true),
    xpGained: attempt.passed ? XP.examPassed : 0,
    coupon: coupon && { code: coupon.code, percent: coupon.percent, expiresAt: coupon.expiresAt },
    retryOpensAt: attempt.passed ? null : retryOpensAt(attempt.finishedAt!),
  };
}
