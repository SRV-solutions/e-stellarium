import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { argentinaDay, currentStreak } from "../games/streak.js";
import { todayReviewSummary } from "../games/review.js";
import { badgesOf } from "../games/glints.js";

export const meRouter = Router();

// La racha, los protectores, cómo va el repaso de hoy, los destellos y las insignias.
// Solo lee: si la racha se cortó, muestra 0
meRouter.get("/me/stats", requireAuth, async (req, res) => {
  const user = req.user!;
  const now = new Date();
  const { streak, freezes, boughtFreezes, activeToday } = currentStreak(user, argentinaDay(now));

  res.json({
    streak,
    streakFreezes: freezes, // los gratis que le quedan este mes
    boughtFreezes, // los comprados, que se usan después de los gratis
    activeToday,
    review: await todayReviewSummary(user.id, now),
    glints: user.glints,
    badges: await badgesOf(user.id),
  });
});
