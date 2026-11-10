import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { Answer, DailyReview, DailyReviewQuestion, Question, User } from "../models/index.js";
import { recordActivity } from "./activity.js";
import { grade, InvalidResponseError } from "./grade.js";
import { present, type StudentQuestion } from "./present.js";
import { awardXp, XP } from "./progress.js";
import { argentinaDay } from "./streak.js";

export const REVIEW_SIZE = 5;

// Cada pregunta del repaso se mezcla distinto de como la vio en la estrella
export function reviewSeed(reviewId: string, questionId: string) {
  return `review:${reviewId}:${questionId}`;
}

// Las preguntas para el repaso: solo de lecciones que ya jugó (nunca del banco), de cursos activos.
// Primero las que falló y nunca acertó; después las que acertó hace más tiempo. Un acierto en un
// repaso anterior también cuenta como acierto. El empate se desarma con el día, para variar.
export async function pickReviewQuestions(userId: string, day: string, t?: Transaction): Promise<string[]> {
  const rows = await sequelize.query<{ id: string }>(
    `SELECT q.id
       FROM questions q
       JOIN stars s ON s.id = q.star_id
       JOIN constellations c ON c.id = s.constellation_id AND c.published
       JOIN products p ON p.id = c.product_id AND p.active
       JOIN answers a ON a.question_id = q.id AND a.user_id = :userId AND a.context IN ('star', 'review')
      WHERE q.status = 'published'
        AND EXISTS (SELECT 1 FROM enrollments e
                     WHERE e.user_id = :userId AND e.product_id = q.product_id AND e.status = 'active')
      GROUP BY q.id
      ORDER BY bool_or(a.correct) ASC,
               max(a.created_at) FILTER (WHERE a.correct) ASC NULLS FIRST,
               md5(q.id::text || :day)
      LIMIT :limit`,
    { replacements: { userId, day, limit: REVIEW_SIZE }, type: QueryTypes.SELECT, transaction: t }
  );
  return rows.map((r) => r.id);
}

type Row = DailyReviewQuestion & { Question: Question };

export type ReviewView = {
  id: string;
  day: string;
  finished: boolean;
  total: number;
  correctCount: number;
  questions: {
    position: number;
    answered: boolean;
    correct: boolean | null;
    question: StudentQuestion;
  }[];
};

async function loadRows(reviewId: string, t: Transaction) {
  return (await DailyReviewQuestion.findAll({
    where: { reviewId },
    include: [Question],
    order: [["position", "ASC"]],
    transaction: t,
  })) as Row[];
}

function view(review: DailyReview, rows: Row[]): ReviewView {
  return {
    id: review.id,
    day: review.day,
    finished: review.finishedAt !== null,
    total: rows.length,
    correctCount: rows.filter((r) => r.correct).length,
    questions: rows.map((r) => ({
      position: r.position,
      answered: r.correct !== null,
      correct: r.correct,
      question: present(r.Question, reviewSeed(review.id, r.questionId)),
    })),
  };
}

// El repaso de hoy. Si todavía no lo abrió, lo arma y lo guarda. Si no jugó ninguna lección, null.
export async function getTodayReview(userId: string, now = new Date()): Promise<ReviewView | null> {
  return sequelize.transaction(async (t) => {
    // Bloquea al alumno: si abre el repaso en dos pestañas a la vez, se arma una sola vez
    await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
    const day = argentinaDay(now);

    let review = await DailyReview.findOne({ where: { userId, day }, transaction: t });
    if (!review) {
      const questionIds = await pickReviewQuestions(userId, day, t);
      if (questionIds.length === 0) return null;

      review = await DailyReview.create({ userId, day }, { transaction: t });
      const reviewId = review.id;
      await DailyReviewQuestion.bulkCreate(
        questionIds.map((questionId, i) => ({ reviewId, questionId, position: i + 1 })),
        { transaction: t }
      );
    }

    return view(review, await loadRows(review.id, t));
  });
}

// Responde la pregunta en `position`. Cada una se responde una sola vez.
// Se busca por el id del repaso y no por "hoy": lo que abrió a las 23:59 se puede responder a las 00:01.
export async function answerReview(
  userId: string,
  reviewId: string,
  position: number,
  response: unknown,
  now = new Date()
) {
  return sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
    const review = await DailyReview.findOne({ where: { id: reviewId, userId }, transaction: t });
    if (!user || !review) throw new HttpError(404, "No encontramos ese repaso.");

    const rows = await loadRows(review.id, t);
    const row = rows.find((r) => r.position === position);
    if (!row) throw new HttpError(404, "No encontramos esa pregunta del repaso.");
    if (row.correct !== null) throw new HttpError(409, "Ya respondiste esta pregunta.");

    const question = (await Question.scope("withAnswer").findByPk(row.questionId, { transaction: t }))!;
    let result;
    try {
      result = grade(question, reviewSeed(review.id, question.id), response);
    } catch (err) {
      if (err instanceof InvalidResponseError) {
        throw new HttpError(400, "La respuesta no tiene un formato válido.");
      }
      throw err;
    }

    await Answer.create(
      { userId, questionId: question.id, context: "review", correct: result.correct, response: response as object },
      { transaction: t }
    );
    await row.update({ correct: result.correct, answeredAt: now }, { transaction: t });
    await recordActivity(user, now, t);

    // xpGained es el total; reviewXp, la parte que fue por terminar el repaso
    let xpGained = 0;
    let reviewXp = 0;
    if (result.correct) xpGained += await awardXp(user, "review_correct", row.id, XP.reviewCorrect, t);

    const finished = rows.every((r) => r.correct !== null);
    if (finished) {
      await review.update({ finishedAt: now }, { transaction: t });
      reviewXp = await awardXp(user, "review_completed", review.id, XP.reviewCompleted, t);
      xpGained += reviewXp;
    }

    return {
      correct: result.correct,
      solution: result.solution,
      output: result.output,
      explanation: question.explanation,
      xpGained,
      reviewXp,
      finished,
      correctCount: rows.filter((r) => r.correct).length,
      total: rows.length,
      streak: user.streak,
    };
  });
}

export type ReviewSummary =
  | { status: "unavailable" } // todavía no jugó ninguna lección
  | { status: "pending" | "in_progress" | "finished"; answered: number; total: number };

// Cómo va el repaso de hoy, para el inicio. No arma nada: solo mira
export async function todayReviewSummary(userId: string, now = new Date()): Promise<ReviewSummary> {
  const day = argentinaDay(now);
  const review = await DailyReview.findOne({ where: { userId, day } });

  if (!review) {
    const total = (await pickReviewQuestions(userId, day)).length;
    return total === 0 ? { status: "unavailable" } : { status: "pending", answered: 0, total };
  }

  const rows = await DailyReviewQuestion.findAll({ where: { reviewId: review.id }, attributes: ["correct"] });
  const answered = rows.filter((r) => r.correct !== null).length;
  return {
    status: review.finishedAt ? "finished" : answered > 0 ? "in_progress" : "pending",
    answered,
    total: rows.length,
  };
}
