import { Router } from "express";
import { Constellation, Coupon, Enrollment, Product, Question, Star, User } from "../models/index.js";
import { sequelize } from "../db.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { HttpError } from "../lib/errors.js";
import { isUuid } from "../lib/uuid.js";
import { couponPercent, EXAM_SIZE, PASS_MARK, SECONDS_PER_TYPE } from "../games/exam.js";
import { getExamState } from "../games/examState.js";
import { answerQuestion, getProgress, startAttempt } from "../games/examFlow.js";
import { drawPractice, isPracticeId, newPracticeId, practiceSeed, practiceWhere } from "../games/practice.js";
import { present } from "../games/present.js";
import { grade, InvalidResponseError } from "../games/grade.js";
import { recordActivity } from "../games/activity.js";

export const examsRouter = Router();

// La estrella de examen, solo si es de un curso activo del alumno y su constelación está publicada
async function findExam(userId: string, id: string) {
  const notFound = new HttpError(404, "No encontramos ese examen.");
  if (!isUuid(id)) throw notFound;

  const star = await Star.findOne({
    where: { id, kind: "exam" },
    include: [
      {
        model: Constellation,
        where: { published: true },
        include: [{ model: Product, where: { active: true } }],
      },
    ],
  });
  if (!star) throw notFound;

  const enrollment = await Enrollment.findOne({
    where: { userId, productId: star.Constellation!.productId, status: "active" },
  });
  if (!enrollment) throw notFound;

  return star;
}

// El examen: en qué estado está, sus reglas y, si ya lo aprobó, el cupón
examsRouter.get("/exams/:starId", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const star = await findExam(userId, req.params.starId as string);
  const constellation = star.Constellation!;

  const state = await getExamState(userId, star);
  const coupon = await Coupon.findOne({ where: { userId, constellationId: constellation.id } });
  const earned = await Coupon.count({ where: { userId, source: "constellation" } });

  res.json({
    star: { id: star.id, title: star.title, position: star.position, letter: "Ω" },
    course: { key: constellation.Product!.key, name: constellation.Product!.name },
    constellationId: constellation.id,
    state,
    rules: {
      questions: EXAM_SIZE,
      passMark: PASS_MARK,
      secondsPerType: SECONDS_PER_TYPE,
      // El porcentaje que ganaría si aprueba ahora (o el que ganó, si ya aprobó)
      couponPercent: coupon ? coupon.percent : couponPercent(earned),
    },
    coupon: coupon && {
      code: coupon.code,
      percent: coupon.percent,
      expiresAt: coupon.expiresAt,
      usedAt: coupon.usedAt,
    },
  });
});

// Empieza un intento (o retoma el que está en curso) y devuelve la primera pregunta
examsRouter.post("/exams/:starId/attempts", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const star = await findExam(userId, req.params.starId as string);

  const attempt = await startAttempt(userId, star);
  res.status(201).json(await getProgress(userId, attempt.id));
});

// La pregunta que toca, o el resultado
examsRouter.get("/exam-attempts/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  if (!isUuid(id)) throw new HttpError(404, "No encontramos ese examen.");
  res.json(await getProgress(req.user!.id, id));
});

// Responde la pregunta actual. Devuelve la que sigue, o el resultado
examsRouter.post("/exam-attempts/:id/answer", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  if (!isUuid(id)) throw new HttpError(404, "No encontramos ese examen.");

  const { position, response } = req.body ?? {};
  if (!Number.isInteger(position)) throw new HttpError(400, "Falta la posición de la pregunta.");

  res.json(await answerQuestion(req.user!.id, id, position, response));
});

// ---- La práctica, una vez aprobado ----

// El examen, solo si ya lo aprobó
async function findPassedExam(userId: string, id: string) {
  const star = await findExam(userId, id);
  const state = await getExamState(userId, star);
  if (state.status !== "passed") throw new HttpError(403, "La práctica se abre cuando aprobás el examen.");
  return star;
}

// Arma una práctica nueva: otras 10 preguntas del curso cada vez
examsRouter.post("/exams/:starId/practice", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const star = await findPassedExam(userId, req.params.starId as string);

  const practiceId = newPracticeId();
  const questions = await drawPractice(star.Constellation!.productId, practiceId);
  res.status(201).json({
    practiceId,
    questions: questions.map((q) => present(q, practiceSeed(userId, practiceId, q.id))),
  });
});

// Corrige una pregunta de la práctica. No da XP ni guarda la respuesta: solo anota la actividad del día
examsRouter.post("/exams/:starId/practice/answer", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const star = await findPassedExam(userId, req.params.starId as string);

  const { practiceId, questionId, response } = req.body ?? {};
  if (!isPracticeId(practiceId) || !isUuid(questionId)) throw new HttpError(400, "Faltan datos de la práctica.");

  // Tiene que ser una pregunta de práctica de este curso: así no se puede pedir la respuesta de una del banco
  const question = await Question.scope("withAnswer").findOne({
    where: { id: questionId, ...practiceWhere(star.Constellation!.productId) },
  });
  if (!question) throw new HttpError(404, "No encontramos esa pregunta.");

  let result;
  try {
    result = grade(question, practiceSeed(userId, practiceId, question.id), response);
  } catch (err) {
    if (err instanceof InvalidResponseError) throw new HttpError(400, "La respuesta no tiene un formato válido.");
    throw err;
  }

  const { streak, newBadges } = await sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
    const { newBadges } = await recordActivity(user!, new Date(), t);
    return { streak: user!.streak, newBadges };
  });

  res.json({
    correct: result.correct,
    solution: result.solution,
    output: result.output,
    explanation: question.explanation,
    streak,
    newBadges,
  });
});
