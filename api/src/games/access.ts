import { Star, StarCompletion } from "../models/index.js";
import { unlockedStarIds } from "./unlock.js";

// Mira las estrellas de su constelación y las que completó
export async function canOpenStar(userId: string, star: Star) {
  const stars = await Star.findAll({ where: { constellationId: star.constellationId } });
  const completions = await StarCompletion.findAll({
    where: { userId, starId: stars.map((s) => s.id) },
  });
  const completedAt = new Map(completions.map((c) => [c.starId, c.createdAt]));

  return unlockedStarIds(stars, completedAt).has(star.id);
}