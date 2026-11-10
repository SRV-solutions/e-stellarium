import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { HttpError } from "../lib/errors.js";
import { isUuid } from "../lib/uuid.js";
import { answerChallenge, getCurrentChallenge, startChallenge } from "../games/challengeFlow.js";
import { getRanking, type RankingPeriod } from "../games/ranking.js";

export const challengesRouter = Router();

// El desafío vigente (se arma la primera vez que se abre). Si está en curso, trae la pregunta que toca
challengesRouter.get("/challenges/current", requireAuth, async (req, res) => {
  res.json(await getCurrentChallenge(req.user!.id));
});

// Empieza el desafío: arranca el reloj y devuelve la primera pregunta
challengesRouter.post("/challenges/:id/start", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  if (!isUuid(id)) throw new HttpError(404, "No encontramos ese desafío.");
  res.json(await startChallenge(req.user!.id, id));
});

// Responde una pregunta. Devuelve si acertó, la correcta y la explicación
challengesRouter.post("/challenges/:id/answer", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  if (!isUuid(id)) throw new HttpError(404, "No encontramos ese desafío.");

  const position = req.body?.position;
  if (!Number.isInteger(position)) throw new HttpError(400, "Falta la posición de la pregunta.");

  res.json(await answerChallenge(req.user!.id, id, position, req.body?.response));
});

// El ranking de la semana (por defecto) o de siempre
challengesRouter.get("/ranking", requireAuth, async (req, res) => {
  const period = (req.query.period ?? "week") as string;
  if (period !== "week" && period !== "all") throw new HttpError(400, "El período tiene que ser week o all.");
  res.json(await getRanking(req.user!.id, period as RankingPeriod));
});
