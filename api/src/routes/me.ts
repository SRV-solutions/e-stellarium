import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { argentinaDay, currentStreak } from "../games/streak.js";
import { todayReviewSummary } from "../games/review.js";

export const meRouter = Router();

// La racha, los protectores y cómo va el repaso de hoy. Solo lee: si la racha se cortó, muestra 0
meRouter.get("/me/stats", requireAuth, async (req, res) => {
  const user = req.user!;
  const now = new Date();
  const { streak, freezes, activeToday } = currentStreak(user, argentinaDay(now));

  res.json({
    streak,
    streakFreezes: freezes,
    activeToday,
    review: await todayReviewSummary(user.id, now),
  });
});
