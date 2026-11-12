import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { argentinaDay, currentStreak } from "../games/streak.js";
import { todayReviewSummary } from "../games/review.js";
import { badgesOf } from "../games/glints.js";
import { wear, type CosmeticKind } from "../games/cosmetics.js";
import { HttpError } from "../lib/errors.js";

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

// Se pone un cosmético que ya compró (o se saca, con id null). Devuelve lo que lleva puesto
meRouter.put("/me/cosmetics", requireAuth, async (req, res) => {
  const { kind, id, variant = 0 } = req.body ?? {};
  if (kind !== "frame" && kind !== "color" && kind !== "title") throw new HttpError(400, "No existe ese tipo de cosmético.");
  if (id !== null && typeof id !== "string") throw new HttpError(400, "Falta el cosmético.");
  if (variant !== 0 && variant !== 1) throw new HttpError(400, "La forma del título tiene que ser 0 o 1.");
  res.json({ worn: await wear(req.user!.id, kind as CosmeticKind, id, variant) });
});
