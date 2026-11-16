import type { Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { couponEmail } from "../lib/email.js";
import { notify } from "../lib/notify.js";
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
  XpEvent,
} from "../models/index.js";
import {
  couponExpiresAt,
  couponPercent,
  drawExamQuestions,
  examSeed,
  generateCouponCode,
  hasPassed,
  retryOpensAt,
  SECONDS_PER_TYPE,
} from "./exam.js";
import { getExamState } from "./examState.js";
import { publishedVersion, questionAt } from "./versions.js";
import { grade, InvalidResponseError } from "./grade.js";
import { present, type StudentQuestion } from "./present.js";
import { awardXp } from "./progress.js";
import { loadEconomy } from "./economy.js";
import { recordActivity } from "./activity.js";
import { advanceClock as advance } from "./clock.js";

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
      attributes: ["id", "type", "version"],
      where: { productId: constellation!.productId, pool: "exam", status: "published" },
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
      // Con la versión de hoy de cada una: el intento se juega entero con esa
      questionIds.map((questionId, i) => ({
        attemptId: attempt.id,
        questionId,
        questionVersion: publishedVersion(bank.find((q) => q.id === questionId)!),
        position: i + 1,
      })),
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
    return buildQuestion(attempt, rows.length, current, now, t);
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
      // La versión que le tocó al sortear, aunque después se haya aprobado otra
      const question = await questionAt(current.questionId, current.questionVersion, t);
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
    return buildQuestion(attempt, rows.length, current, now, t);
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

async function buildQuestion(attempt: ExamAttempt, total: number, row: Row, now: Date, t: Transaction): Promise<ExamProgress> {
  const question = await questionAt(row.questionId, row.questionVersion, t);
  return {
    status: "question",
    attemptId: attempt.id,
    position: row.position,
    total,
    timeLimitSeconds: SECONDS_PER_TYPE[row.Question.type],
    remainingMs: Math.max(0, row.deadlineAt!.getTime() - now.getTime()),
    question: present(question!, examSeed(attempt.id, row.questionId)),
  };
}

// Cierra el intento. Si aprobó: enciende la estrella de examen, da la experiencia y el cupón.
async function finish(user: User, attempt: ExamAttempt, rows: Row[], now: Date, t: Transaction) {
  const correctCount = rows.filter((r) => r.correct).length;
  const passed = hasPassed(correctCount);
  await attempt.update({ finishedAt: now, correctCount, passed }, { transaction: t });

  if (passed) {
    await StarCompletion.findOrCreate({ where: { userId: user.id, starId: attempt.starId }, transaction: t });
    const economy = await loadEconomy(t);
    await awardXp(user, "exam_passed", attempt.starId, economy.xp.examPassed, t);

    const star = await Star.findByPk(attempt.starId, {
      include: [{ model: Constellation, include: [Product] }],
      transaction: t,
    });
    const constellation = star!.Constellation!;
    // El primero de constelación es el más alto: los de la tienda no cuentan
    const earned = await Coupon.count({ where: { userId: user.id, source: "constellation" }, transaction: t });

    const coupon = await Coupon.create(
      {
        code: await uniqueCouponCode(constellation.Product!.key, t),
        percent: couponPercent(earned, economy.coupons),
        source: "constellation",
        expiresAt: couponExpiresAt(now, economy.coupons),
        userId: user.id,
        constellationId: constellation.id,
        examAttemptId: attempt.id,
      },
      { transaction: t }
    );

    await notify(t, [user.id], {
      kind: "coupon",
      title: `Ganaste un cupón del ${coupon.percent} %`,
      body: `Por aprobar el examen de ${constellation.Product!.name}. Está en Mis cupones.`,
      link: "/#mis-cupones",
      emailSent: true, // el mail del cupón sale abajo, después del commit
    });
    // El mail, solo si la transacción se guardó
    const mail = couponEmail(user.name, constellation.Product!.name, coupon.code, coupon.percent, coupon.expiresAt);
    t.afterCommit(() => {
      sendMail({ to: user.email, ...mail }).catch((err) => console.error("No se pudo enviar el mail del cupón", err));
    });
  }

  return buildResult(attempt, t, rows);
}

// Un código que no exista todavía. Con 6 caracteres casi nunca hace falta un segundo intento.
export async function uniqueCouponCode(courseKey: string, t: Transaction) {
  for (let i = 0; i < 5; i++) {
    const code = generateCouponCode(courseKey);
    if (!(await Coupon.findOne({ where: { code }, transaction: t }))) return code;
  }
  throw new Error("No se pudo generar un código de cupón único");
}

async function buildResult(attempt: ExamAttempt, t: Transaction, rows?: Row[]): Promise<ExamProgress> {
  rows ??= await loadRows(attempt.id, t);
  const coupon = await Coupon.findOne({ where: { examAttemptId: attempt.id }, transaction: t });
  // La XP que dio de verdad (si después cambió en settings, se muestra la de ese momento)
  const xpEvent = attempt.passed
    ? await XpEvent.findOne({
        where: { userId: attempt.userId, reason: "exam_passed", referenceId: attempt.starId },
        transaction: t,
      })
    : null;

  return {
    status: "finished",
    attemptId: attempt.id,
    total: rows.length,
    correctCount: attempt.correctCount!,
    passed: attempt.passed!,
    results: rows.map((r) => r.correct === true),
    xpGained: xpEvent?.xp ?? 0,
    coupon: coupon && { code: coupon.code, percent: coupon.percent, expiresAt: coupon.expiresAt },
    retryOpensAt: attempt.passed ? null : retryOpensAt(attempt.finishedAt!),
  };
}
