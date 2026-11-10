import { Op, QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { HttpError } from "../lib/errors.js";
import {
  Answer,
  Challenge,
  ChallengeAttempt,
  ChallengeAttemptQuestion,
  Enrollment,
  Product,
  Question,
  User,
} from "../models/index.js";
import type { ChallengePart } from "../models/ChallengeAttemptQuestion.js";
import type { Difficulty, QuestionType } from "../models/Question.js";
import { recordActivity } from "./activity.js";
import { challengeSeed, latestSlot, nextSlot, planChallenge, type Candidate } from "./challenge.js";
import { advanceClock } from "./clock.js";
import { SECONDS_PER_TYPE } from "./exam.js";
import { grade, InvalidResponseError } from "./grade.js";
import { present, type StudentQuestion } from "./present.js";
import { awardXp, XP } from "./progress.js";

type Row = ChallengeAttemptQuestion & { Question: Question };
type Course = { key: string; name: string };

export type ChallengeStep = {
  position: number;
  total: number;
  part: ChallengePart;
  timeLimitSeconds: number;
  remainingMs: number; // en milisegundos, para no depender del reloj del navegador
  question: StudentQuestion;
};

export type ChallengeResult = {
  correctCount: number;
  total: number;
  xpGained: number;
  results: { part: ChallengePart; correct: boolean }[];
  recommendation: Course | null; // el curso de "Explorá", para recomendarlo al final
};

export type ChallengeView = {
  challenge: { id: string; publishedAt: Date; closesAt: Date };
  // unavailable: no hay preguntas de desafío para sus cursos; ready: armado, sin empezar
  status: "unavailable" | "ready" | "in_progress" | "finished";
  total: number;
  parts: Record<ChallengePart, number>;
  explore: Course | null;
  current: ChallengeStep | null; // la pregunta que toca, si está en curso
  result: ChallengeResult | null; // si ya terminó
};

// ---------- El desafío de esta semana ----------

// El desafío vigente. Si todavía nadie lo pidió desde que se publicó, crea la fila: así no hace
// falta un proceso programado. Si dos alumnos lo piden a la vez, la restricción única de
// published_at hace que se cree uno solo.
async function currentChallenge(now: Date, t: Transaction): Promise<Challenge> {
  const latest = await Challenge.findOne({
    where: { publishedAt: { [Op.lte]: now } },
    order: [["publishedAt", "DESC"]],
    transaction: t,
  });
  if (latest && latest.closesAt > now) return latest;

  const publishedAt = latestSlot(now);
  await Challenge.bulkCreate([{ publishedAt, closesAt: nextSlot(publishedAt) }], {
    ignoreDuplicates: true,
    transaction: t,
  });
  return (await Challenge.findOne({ where: { publishedAt }, transaction: t }))!;
}

// Las preguntas de desafío de los cursos activos, con lo que este alumno ya hizo con cada una.
// Solo cuentan como vistas las que se le mostraron (no las de un desafío que armó y no empezó).
async function loadCandidates(userId: string, t: Transaction): Promise<Candidate[]> {
  const rows = await sequelize.query<{
    id: string;
    product_id: string;
    difficulty: Difficulty;
    type: QuestionType;
    seen: boolean;
    ever_right: boolean | null;
    last_seen_at: Date | null;
  }>(
    `SELECT q.id, q.product_id, q.difficulty, q.type,
            count(caq.shown_at) > 0 AS seen,
            bool_or(caq.correct) AS ever_right,
            max(caq.shown_at) AS last_seen_at
       FROM questions q
       JOIN products p ON p.id = q.product_id AND p.active
       LEFT JOIN (challenge_attempt_questions caq
                  JOIN challenge_attempts ca ON ca.id = caq.attempt_id AND ca.user_id = :userId)
              ON caq.question_id = q.id AND caq.shown_at IS NOT NULL
      WHERE q.pool = 'challenge' AND q.status = 'published'
      GROUP BY q.id`,
    { replacements: { userId }, type: QueryTypes.SELECT, transaction: t }
  );
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    difficulty: r.difficulty,
    type: r.type,
    seen: r.seen,
    failed: r.seen && !r.ever_right,
    lastSeenAt: r.last_seen_at,
  }));
}

// Arma el desafío del alumno y lo guarda. Si no hay preguntas para sus cursos, no crea nada.
async function buildAttempt(userId: string, challenge: Challenge, t: Transaction) {
  const enrollments = await Enrollment.findAll({ where: { userId, status: "active" }, transaction: t });
  const own = enrollments.map((e) => e.productId);
  const candidates = await loadCandidates(userId, t);

  // La semilla es alumno y desafío: si se arma dos veces (no debería), da lo mismo
  const plan = planChallenge(own, candidates, `${challenge.id}:${userId}`);
  if (plan.questions.length === 0) return null;

  const attempt = await ChallengeAttempt.create({ challengeId: challenge.id, userId }, { transaction: t });
  await ChallengeAttemptQuestion.bulkCreate(
    plan.questions.map((q, i) => ({ attemptId: attempt.id, questionId: q.questionId, part: q.part, position: i + 1 })),
    { transaction: t }
  );
  return attempt;
}

async function loadRows(attemptId: string, t: Transaction) {
  return (await ChallengeAttemptQuestion.findAll({
    where: { attemptId },
    include: [Question],
    order: [["position", "ASC"]],
    transaction: t,
  })) as Row[];
}

// El curso de las preguntas de "Explorá", para mostrarlo antes y recomendarlo al final
async function exploreCourse(rows: Row[], t: Transaction): Promise<Course | null> {
  const row = rows.find((r) => r.part === "explore");
  if (!row) return null;
  const product = await Product.findByPk(row.Question.productId, { transaction: t });
  return product && { key: product.key, name: product.name };
}

function step(attempt: ChallengeAttempt, rows: Row[], row: Row, now: Date): ChallengeStep {
  return {
    position: row.position,
    total: rows.length,
    part: row.part,
    timeLimitSeconds: SECONDS_PER_TYPE[row.Question.type],
    remainingMs: Math.max(0, row.deadlineAt!.getTime() - now.getTime()),
    question: present(row.Question, challengeSeed(attempt.id, row.questionId)),
  };
}

function result(attempt: ChallengeAttempt, rows: Row[], explore: Course | null): ChallengeResult {
  const correctCount = attempt.correctCount ?? 0;
  return {
    correctCount,
    total: rows.length,
    xpGained: correctCount * XP.challengeCorrect + XP.challengeCompleted,
    results: rows.map((r) => ({ part: r.part, correct: r.correct === true })),
    recommendation: explore,
  };
}

// Cierra el intento y da la experiencia por terminarlo
async function finish(user: User, attempt: ChallengeAttempt, rows: Row[], now: Date, t: Transaction) {
  const correctCount = rows.filter((r) => r.correct).length;
  await attempt.update({ finishedAt: now, correctCount }, { transaction: t });
  await awardXp(user, "challenge_completed", attempt.id, XP.challengeCompleted, t);
}

async function lockUser(userId: string, t: Transaction) {
  const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
  if (!user) throw new HttpError(404, "No encontramos al alumno.");
  return user;
}

async function findAttempt(userId: string, challengeId: string, t: Transaction) {
  return ChallengeAttempt.findOne({ where: { challengeId, userId }, lock: t.LOCK.UPDATE, transaction: t });
}

// Arma la vista. Si está en curso, avanza el reloj y muestra la pregunta que toca.
async function view(
  user: User,
  challenge: Challenge,
  attempt: ChallengeAttempt | null,
  now: Date,
  t: Transaction
): Promise<ChallengeView> {
  const base = {
    challenge: { id: challenge.id, publishedAt: challenge.publishedAt, closesAt: challenge.closesAt },
    current: null,
    result: null,
  };
  if (!attempt) {
    return { ...base, status: "unavailable", total: 0, parts: { own: 0, explore: 0, discover: 0 }, explore: null };
  }

  const rows = await loadRows(attempt.id, t);
  const explore = await exploreCourse(rows, t);
  const count = (part: ChallengePart) => rows.filter((r) => r.part === part).length;
  const summary = {
    ...base,
    total: rows.length,
    parts: { own: count("own"), explore: count("explore"), discover: count("discover") },
    explore,
  };

  if (!attempt.finishedAt && attempt.startedAt) {
    const current = await advanceClock(rows, now, t);
    if (current) return { ...summary, status: "in_progress", current: step(attempt, rows, current, now) };
    await finish(user, attempt, rows, now, t);
  }
  if (attempt.finishedAt) return { ...summary, status: "finished", result: result(attempt, rows, explore) };
  return { ...summary, status: "ready" };
}

// ---------- Lo que usan las rutas ----------

// El desafío vigente para el alumno. La primera vez que lo abre, se arma y queda guardado.
export async function getCurrentChallenge(userId: string, now = new Date()): Promise<ChallengeView> {
  return sequelize.transaction(async (t) => {
    // Bloquea al alumno: si lo abre en dos pestañas a la vez, se arma una sola vez
    const user = await lockUser(userId, t);
    const challenge = await currentChallenge(now, t);
    const attempt = (await findAttempt(userId, challenge.id, t)) ?? (await buildAttempt(userId, challenge, t));
    return view(user, challenge, attempt, now, t);
  });
}

// Aprieta "Empezar": arranca el reloj y devuelve la primera pregunta. Un solo intento.
export async function startChallenge(userId: string, challengeId: string, now = new Date()) {
  return sequelize.transaction(async (t) => {
    const user = await lockUser(userId, t);
    const challenge = await Challenge.findByPk(challengeId, { transaction: t });
    if (!challenge || challenge.publishedAt > now) throw new HttpError(404, "No encontramos ese desafío.");

    const attempt = await findAttempt(userId, challenge.id, t);
    if (!attempt) throw new HttpError(404, "No encontramos ese desafío.");
    if (attempt.finishedAt) throw new HttpError(409, "Ya jugaste este desafío.");
    if (!attempt.startedAt) {
      if (challenge.closesAt <= now) throw new HttpError(409, "Este desafío ya cerró.");
      await attempt.update({ startedAt: now }, { transaction: t });
    }
    return view(user, challenge, attempt, now, t);
  });
}

export type ChallengeVerdict = {
  correct: boolean;
  timedOut: boolean; // se le terminó el tiempo antes de que llegara la respuesta
  solution: object | null;
  output: string | null;
  explanation: string;
  xpGained: number; // por esta respuesta y, si era la última, por terminar el desafío
  finished: boolean;
  result: ChallengeResult | null;
};

// Responde la pregunta en `position`. No muestra la siguiente: su reloj arranca recién cuando el
// alumno la pide (GET /challenges/current), después de leer la explicación.
export async function answerChallenge(
  userId: string,
  challengeId: string,
  position: number,
  response: unknown,
  now = new Date()
): Promise<ChallengeVerdict> {
  return sequelize.transaction(async (t) => {
    const user = await lockUser(userId, t);
    const attempt = await findAttempt(userId, challengeId, t);
    if (!attempt || !attempt.startedAt) throw new HttpError(409, "Todavía no empezaste este desafío.");
    if (attempt.finishedAt) throw new HttpError(409, "Ya terminaste este desafío.");

    const rows = await loadRows(attempt.id, t);
    const row = rows.find((r) => r.position === position);
    if (!row) throw new HttpError(404, "No encontramos esa pregunta del desafío.");
    if (row.answeredAt) throw new HttpError(409, "Ya respondiste esta pregunta.");

    const current = await advanceClock(rows, now, t);
    await recordActivity(user, now, t);

    let verdict: Omit<ChallengeVerdict, "xpGained" | "finished" | "result">;
    let xpGained = 0;

    if (current?.position === position) {
      const question = (await Question.scope("withAnswer").findByPk(row.questionId, { transaction: t }))!;
      let graded;
      try {
        graded = grade(question, challengeSeed(attempt.id, question.id), response);
      } catch (err) {
        if (err instanceof InvalidResponseError) throw new HttpError(400, "La respuesta no tiene un formato válido.");
        throw err;
      }
      await Answer.create(
        { userId, questionId: question.id, context: "challenge", correct: graded.correct, response: response as object },
        { transaction: t }
      );
      await row.update({ correct: graded.correct, response: response as object, answeredAt: now }, { transaction: t });
      if (graded.correct) xpGained += await awardXp(user, "challenge_correct", row.id, XP.challengeCorrect, t);
      verdict = {
        correct: graded.correct,
        timedOut: false,
        solution: graded.solution,
        output: graded.output ?? null,
        explanation: question.explanation,
      };
    } else if (row.correct === false) {
      // Se le venció antes de que llegara la respuesta: cuenta como mal
      verdict = { correct: false, timedOut: true, solution: null, output: null, explanation: row.Question.explanation };
    } else {
      // Todavía no se le mostró: no puede responderla
      throw new HttpError(409, "Esa pregunta todavía no te tocó.");
    }

    const finished = rows.every((r) => r.correct !== null);
    if (finished) {
      await finish(user, attempt, rows, now, t);
      xpGained += XP.challengeCompleted;
    }

    return {
      ...verdict,
      xpGained,
      finished,
      result: finished ? result(attempt, rows, await exploreCourse(rows, t)) : null,
    };
  });
}
