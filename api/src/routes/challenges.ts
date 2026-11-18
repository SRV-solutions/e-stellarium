import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requirePlayer } from "../middlewares/requirePlayer.js";
import { HttpError } from "../lib/errors.js";
import { isUuid } from "../lib/uuid.js";
import { answerChallenge, getCurrentChallenge, startChallenge } from "../games/challengeFlow.js";
import { BOARDS, getRanking, type Board, type RankingPeriod } from "../games/ranking.js";

export const challengesRouter = Router();

// El desafío vigente (se arma la primera vez que se abre). Si está en curso, trae la pregunta que toca
challengesRouter.get("/challenges/current", requireAuth, requirePlayer, async (req, res) => {
  res.json(await getCurrentChallenge(req.user!.id));
});

// Empieza el desafío: arranca el reloj y devuelve la primera pregunta
challengesRouter.post("/challenges/:id/start", requireAuth, requirePlayer, async (req, res) => {
  const id = req.params.id as string;
  if (!isUuid(id)) throw new HttpError(404, "No encontramos ese desafío.");
  res.json(await startChallenge(req.user!.id, id));
});

// Responde una pregunta. Devuelve si acertó, la correcta y la explicación
challengesRouter.post("/challenges/:id/answer", requireAuth, requirePlayer, async (req, res) => {
  const id = req.params.id as string;
  if (!isUuid(id)) throw new HttpError(404, "No encontramos ese desafío.");

  const position = req.body?.position;
  if (!Number.isInteger(position)) throw new HttpError(400, "Falta la posición de la pregunta.");

  res.json(await answerChallenge(req.user!.id, id, position, req.body?.response));
});

// El ranking: `board` elige la tabla (por defecto la de experiencia) y `period` (semana o de siempre)
// solo cambia algo en la de experiencia
challengesRouter.get("/ranking", requireAuth, requirePlayer, async (req, res) => {
  const board = (req.query.board ?? "xp") as string;
  if (!(BOARDS as readonly string[]).includes(board)) throw new HttpError(400, `La tabla tiene que ser una de: ${BOARDS.join(", ")}.`);
  const period = (req.query.period ?? "week") as string;
  if (period !== "week" && period !== "all") throw new HttpError(400, "El período tiene que ser week o all.");
  res.json(await getRanking(req.user!.id, board as Board, period as RankingPeriod));
});
