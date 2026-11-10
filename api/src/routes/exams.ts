import { Router } from "express";
import { Constellation, Coupon, Enrollment, Product, Star } from "../models/index.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { HttpError } from "../lib/errors.js";
import { isUuid } from "../lib/uuid.js";
import { couponPercent, EXAM_SIZE, PASS_MARK, SECONDS_PER_TYPE } from "../games/exam.js";
import { getExamState } from "../games/examState.js";
import { answerQuestion, getProgress, startAttempt } from "../games/examFlow.js";

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
  const earned = await Coupon.count({ where: { userId } });

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
