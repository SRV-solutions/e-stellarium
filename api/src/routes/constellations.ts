import { Router } from "express";
import { Constellation, Enrollment, Product, Star, StarCompletion } from "../models/index.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { unlockedStarIds } from "../games/unlock.js";

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
  const completedIds = new Set(completions.map((c) => c.starId));

  res.json({
    constellations: constellations.map((constellation) => {
      const stars = constellation.Stars ?? [];
      const unlocked = unlockedStarIds(stars, completedIds);

      return {
        id: constellation.id,
        name: constellation.name,
        description: constellation.description,
        course: { key: constellation.Product!.key, name: constellation.Product!.name },
        completedStars: stars.filter((s) => completedIds.has(s.id)).length,
        totalStars: stars.length,
        stars: stars.map((star) => ({
          id: star.id,
          title: star.title,
          position: star.position,
          kind: star.kind,
          completed: completedIds.has(star.id),
          unlocked: unlocked.has(star.id),
        })),
      };
    }),
  });
});