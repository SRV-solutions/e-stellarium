import type { Transaction } from "sequelize";
import { DailyActivity, type User } from "../models/index.js";
import { argentinaDay, registerDay } from "./streak.js";

// Anota que el alumno jugó hoy y, si es lo primero del día, actualiza la racha.
// Se llama dentro de una transacción que ya bloqueó al alumno.
export async function recordActivity(user: User, now: Date, t: Transaction) {
  const day = argentinaDay(now);
  const [, created] = await DailyActivity.findOrCreate({ where: { userId: user.id, day }, transaction: t });
  if (!created) return;

  const next = registerDay(user, day);
  await user.update(
    { streak: next.streak, lastActiveOn: next.lastActiveOn, streakFreezes: next.streakFreezes },
    { transaction: t }
  );
}
