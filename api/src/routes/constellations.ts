import { Router } from "express";
import { Constellation, Coupon, Enrollment, ExamAttempt, Product, Question, Star, StarCompletion } from "../models/index.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { examOpensAt, unlockedStarIds } from "../games/unlock.js";
import { computeExamState } from "../games/examState.js";
import { couponPercent } from "../games/exam.js";
import { sequelize } from "../db.js";
import { starLetters } from "../games/starLetter.js";
import { practiceWhere } from "../games/practice.js";

export const constellationsRouter = Router();

constellationsRouter.get("/constellations", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  // Los cursos del alumno
  const enrollments = await Enrollment.findAll({ where: { userId, status: "active" } });
  const productIds = enrollments.map((e) => e.productId);
  if (productIds.length === 0) {
    res.json({ constellations: [] });
    return;
  }

  // Sus constelaciones publicadas, con las estrellas en orden
  const constellations = await Constellation.findAll({
    where: { productId: productIds, published: true },
    include: [
      { model: Product, where: { active: true } },
      { model: Star },
    ],
    order: [
      [Product, "name", "ASC"],
      [Star, "position", "ASC"],
    ],
  });

  // Lo que ya completó
  const completions = await StarCompletion.findAll({ where: { userId } });
  const completedAt = new Map(completions.map((c) => [c.starId, c.createdAt]));

  // Los intentos de examen, y el porcentaje del cupón que ganaría si aprueba uno ahora
  const attempts = await ExamAttempt.findAll({ where: { userId }, order: [["number", "ASC"]] });
  const nextCouponPercent = couponPercent(await Coupon.count({ where: { userId } }));

    // Cuántas preguntas publicadas tiene cada estrella
  const starIds = constellations.flatMap((c) => (c.Stars ?? []).map((s) => s.id));
  const counts =
    starIds.length === 0
      ? []
      : ((await Question.findAll({
          attributes: ["starId", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
          where: { starId: starIds, status: "published" },
          group: ["star_id"],
          raw: true,
        })) as unknown as { starId: string; count: string }[]);
  const questionCount = new Map(counts.map((c) => [c.starId, Number(c.count)]));

  // Cuántas preguntas hay para practicar en cada curso, una vez aprobado el examen
  const practiceCounts = (await Question.findAll({
    attributes: ["productId", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
    where: practiceWhere(productIds),
    group: ["product_id"],
    raw: true,
  })) as unknown as { productId: string; count: string }[];
  const practiceCount = new Map(practiceCounts.map((c) => [c.productId, Number(c.count)]));

  res.json({
    constellations: constellations.map((constellation) => {
      const stars = constellation.Stars ?? [];
      const unlocked = unlockedStarIds(stars, completedAt);
      const opensAt = examOpensAt(stars, completedAt);
      const letters = starLetters(stars);

      return {
        id: constellation.id,
        name: constellation.name,
        description: constellation.description,
        // Los módulos de la guía (número y título), para decir de qué módulo es cada estrella
        modules: constellation.modules.map((m) => ({ number: m.number, title: m.title })),
        course: { key: constellation.Product!.key, name: constellation.Product!.name },
        completedStars: stars.filter((s) => completedAt.has(s.id)).length,
        totalStars: stars.length,
        stars: stars.map((star) => ({
          id: star.id,
          title: star.title,
          description: star.description,
          position: star.position,
          letter: letters.get(star.id)!,
          module: star.module,
          kind: star.kind,
          questionCount: questionCount.get(star.id) ?? 0,
          completed: completedAt.has(star.id),
          unlocked: unlocked.has(star.id),
          // Solo en la estrella de examen: en qué estado está, para el mapa y el visor
          ...(star.kind === "exam" && {
            exam: {
              ...computeExamState(
                opensAt,
                attempts.filter((a) => a.starId === star.id)
              ),
              couponPercent: nextCouponPercent,
              practiceCount: practiceCount.get(constellation.productId) ?? 0,
            },
          }),
        })),
      };
    }),
  });
});