import type { Transaction } from "sequelize";
import { DailyActivity, type User } from "../models/index.js";
import { awardStreakBadges } from "./glints.js";
import { argentinaDay, registerDay } from "./streak.js";

// Anota que el alumno jugó hoy y, si es lo primero del día, actualiza la racha y da las insignias
// que alcanzó. Se llama dentro de una transacción que ya bloqueó al alumno.
// Devuelve las insignias nuevas (casi siempre ninguna), para avisarle después del veredicto.
export async function recordActivity(user: User, now: Date, t: Transaction) {
  const day = argentinaDay(now);
  const [, created] = await DailyActivity.findOrCreate({ where: { userId: user.id, day }, transaction: t });
  if (!created) return { newBadges: [] };

  const next = registerDay(user, day);
  await user.update(
    {
      streak: next.streak,
      lastActiveOn: next.lastActiveOn,
      streakFreezes: next.streakFreezes,
      boughtFreezes: next.boughtFreezes,
    },
    { transaction: t }
  );
  return { newBadges: await awardStreakBadges(user, next.streak, t) };
}
