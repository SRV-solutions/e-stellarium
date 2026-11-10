import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { HttpError } from "../lib/errors.js";
import { isUuid } from "../lib/uuid.js";
import { answerReview, getTodayReview } from "../games/review.js";

export const reviewRouter = Router();

// El repaso de hoy (se arma la primera vez que se abre). Si todavía no jugó ninguna lección, null
reviewRouter.get("/review/today", requireAuth, async (req, res) => {
  res.json({ review: await getTodayReview(req.user!.id) });
});

reviewRouter.post("/reviews/:id/answer", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(404, "No encontramos ese repaso.");

  const position = req.body?.position;
  if (!Number.isInteger(position)) throw new HttpError(400, "La respuesta no tiene un formato válido.");

  res.json(await answerReview(req.user!.id, id, position, req.body?.response));
});
