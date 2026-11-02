import { Router } from "express";
import { Answer, Constellation, Enrollment, Product, Question, Star } from "../models/index.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { HttpError } from "../lib/errors.js";
import { isUuid } from "../lib/uuid.js";
import { seedFor } from "../games/present.js";
import { grade, InvalidResponseError } from "../games/grade.js";

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

  // Corregir, con la misma semilla con la que se le mostró
  const response = req.body?.response;
  let result;
  try {
    result = grade(question, seedFor(userId, question.id), response);
  } catch (err) {
    if (err instanceof InvalidResponseError) {
      throw new HttpError(400, "La respuesta no tiene un formato válido.");
    }
    throw err;
  }

  // Guardar la respuesta
  await Answer.create({
    userId,
    questionId: question.id,
    context: "star",
    correct: result.correct,
    response,
  });

  // Ahora sí, la solución y la explicación
  res.json({
    correct: result.correct,
    solution: result.solution,
    explanation: question.explanation,
  });
});