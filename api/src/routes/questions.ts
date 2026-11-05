import { Router } from "express";
import { Constellation, Enrollment, Product, Question, Star } from "../models/index.js";
import { recordStarAnswer } from "../games/progress.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { HttpError } from "../lib/errors.js";
import { isUuid } from "../lib/uuid.js";
import { seedFor } from "../games/present.js";
import { grade, InvalidResponseError } from "../games/grade.js";
import { canOpenStar } from "../games/access.js";

export const questionsRouter = Router();

questionsRouter.post("/questions/:id/answer", requireAuth, async (req, res) => {
  const notFound = new HttpError(404, "No encontramos esa pregunta.");
  const { id } = req.params;
  if (!isUuid(id)) throw notFound;
  const userId = req.user!.id;

  // La pregunta, con la respuesta, solo si está en una estrella visible
  const question = await Question.scope("withAnswer").findOne({
    where: { id, status: "published" },
    include: [
      {
        model: Star,
        required: true,
        include: [
          {
            model: Constellation,
            where: { published: true },
            include: [{ model: Product, where: { active: true } }],
          },
        ],
      },
    ],
  });
  if (!question) throw notFound;

  // El alumno tiene que tener el curso
  const enrollment = await Enrollment.findOne({
    where: { userId, productId: question.productId, status: "active" },
  });
  if (!enrollment) throw notFound;

    // La estrella de la pregunta tiene que estar desbloqueada
  if (!(await canOpenStar(userId, question.Star!))) {
    throw new HttpError(403, "Completá la estrella anterior para responder esta pregunta.");
  }

  // El intento que se le mostró. Si no viene, es el primero
  const attempt = req.body?.attempt === undefined ? 0 : req.body.attempt;
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new HttpError(400, "La respuesta no tiene un formato válido.");
  }

  // Corregir, con la misma semilla con la que se le mostró
  const response = req.body?.response;
  let result;
  try {
    result = grade(question, seedFor(userId, question.id, attempt), response);
  } catch (err) {
    if (err instanceof InvalidResponseError) {
      throw new HttpError(400, "La respuesta no tiene un formato válido.");
    }
    throw err;
  }

    // Guardar la respuesta, la experiencia y la estrella completada, todo junto
  const { xpGained, starXp, starCompleted } = await recordStarAnswer({
    userId,
    questionId: question.id,
    starId: question.starId!,
    correct: result.correct,
    response,
  });

  // Ahora sí, la solución y la explicación
    res.json({
    correct: result.correct,
    solution: result.solution,
    output: result.output,
    explanation: question.explanation,
    xpGained,
    starXp,
    starCompleted,
  });
});