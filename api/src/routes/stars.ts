import { Router } from "express";
import { Answer, Constellation, Enrollment, Product, Question, Star } from "../models/index.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { HttpError } from "../lib/errors.js";
import { present, seedFor } from "../games/present.js";
import { isUuid } from "../lib/uuid.js";
import { canOpenStar } from "../games/access.js";

export const starsRouter = Router();


starsRouter.get("/stars/:id", requireAuth, async (req, res) => {
  const notFound = new HttpError(404, "No encontramos esa estrella.");
  const { id } = req.params;
  if (!isUuid(id)) throw notFound;

  // La estrella, solo si su constelación está publicada y su curso activo
  const star = await Star.findByPk(id, {
    include: [
      {
        model: Constellation,
        where: { published: true },
        include: [{ model: Product, where: { active: true } }],
      },
    ],
  });
  if (!star) throw notFound;

  // El alumno tiene que tener el curso
  const enrollment = await Enrollment.findOne({
    where: { userId: req.user!.id, productId: star.Constellation!.productId, status: "active" },
  });
  if (!enrollment) throw notFound;

  // La estrella tiene que estar desbloqueada
  if (!(await canOpenStar(req.user!.id, star))) {
    throw new HttpError(403, "Completá la estrella anterior para abrir esta.");
  }

  // Las preguntas publicadas, en orden.
  const questions = await Question.findAll({
    where: { starId: star.id, status: "published" },
    order: [["position", "ASC"]],
  });

  // Cuántas veces respondió el alumno cada pregunta: ese es el intento que va a jugar ahora
  const counts = (await Answer.count({
    where: { userId: req.user!.id, questionId: questions.map((q) => q.id) },
    group: ["questionId"],
  })) as unknown as { questionId: string; count: number }[];
  const attemptOf = new Map(counts.map((c) => [c.questionId, Number(c.count)]));

  // Cada pregunta mezclada para este alumno y este intento
  res.json({
    star: {
      id: star.id,
      title: star.title,
      description: star.description,
      kind: star.kind,
      position: star.position,
    },
    questions: questions.map((q) => {
      const attempt = attemptOf.get(q.id) ?? 0;
      return { ...present(q, seedFor(req.user!.id, q.id, attempt)), attempt };
    }),
  });
});