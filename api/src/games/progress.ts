import type { Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { Answer, Question, StarCompletion, User, XpEvent } from "../models/index.js";
import type { XpReason } from "../models/XpEvent.js";

export const XP = {
  questionCorrect: 10,
  starCompleted: 50,
  examPassed: 100,
};

// Da experiencia solo si nunca la dio por este mismo motivo. Devuelve cuánta dio
export async function awardXp(user: User, reason: XpReason, referenceId: string, xp: number, t: Transaction) {
  const already = await XpEvent.findOne({
    where: { userId: user.id, reason, referenceId },
    transaction: t,
  });
  if (already) return 0;

  await XpEvent.create({ userId: user.id, reason, referenceId, xp }, { transaction: t });
  await user.increment("totalXp", { by: xp, transaction: t });
  return xp;
}

// ¿El alumno acertó todas las preguntas publicadas de la estrella?
async function isStarComplete(userId: string, starId: string, t: Transaction) {
  const total = await Question.count({ where: { starId, status: "published" }, transaction: t });
  const answeredRight = await Answer.count({
    where: { userId, correct: true },
    include: [{ model: Question, where: { starId, status: "published" }, attributes: [] }],
    distinct: true,
    col: "question_id",
    transaction: t,
  });
  return total > 0 && answeredRight >= total;
}

type StarAnswer = {
  userId: string;
  questionId: string;
  starId: string;
  correct: boolean;
  response: object;
};

export async function recordStarAnswer({ userId, questionId, starId, correct, response }: StarAnswer) {
  return sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
    if (!user) throw new Error("El usuario no existe");

    await Answer.create({ userId, questionId, context: "star", correct, response }, { transaction: t });

    // xpGained es el total; starXp, la parte de ese total que se dio por encender la estrella
    let xpGained = 0;
    let starXp = 0;
    let starCompleted = false;
    if (!correct) return { xpGained, starXp, starCompleted };

    xpGained += await awardXp(user, "question_correct", questionId, XP.questionCorrect, t);

    if (await isStarComplete(userId, starId, t)) {
      const [, created] = await StarCompletion.findOrCreate({
        where: { userId, starId },
        transaction: t,
      });
      if (created) {
        starCompleted = true;
        starXp = await awardXp(user, "star_completed", starId, XP.starCompleted, t);
        xpGained += starXp;
      }
    }

    return { xpGained, starXp, starCompleted };
  });
}