import { Router } from "express";
import { Constellation, Enrollment, Product, Question, Star, StarCompletion } from "../models/index.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { unlockedStarIds } from "../games/unlock.js";
import { sequelize } from "../db.js";

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

  res.json({
    constellations: constellations.map((constellation) => {
      const stars = constellation.Stars ?? [];
      const unlocked = unlockedStarIds(stars, completedAt);

      return {
        id: constellation.id,
        name: constellation.name,
        description: constellation.description,
        course: { key: constellation.Product!.key, name: constellation.Product!.name },
        completedStars: stars.filter((s) => completedAt.has(s.id)).length,
        totalStars: stars.length,
        stars: stars.map((star) => ({
          id: star.id,
          title: star.title,
          description: star.description,
          position: star.position,
          kind: star.kind,
          questionCount: questionCount.get(star.id) ?? 0,
          completed: completedAt.has(star.id),
          unlocked: unlocked.has(star.id),
        })),
      };
    }),
  });
});