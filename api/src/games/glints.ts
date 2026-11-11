import type { Transaction } from "sequelize";
import { GlintEvent, StreakBadge, type User } from "../models/index.js";
import type { GlintReason } from "../models/GlintEvent.js";

// Los destellos: una moneda aparte del XP, que se gasta en la tienda. Las estrellas y el examen no dan.
export const GLINTS = {
  challengeCorrect: 3,
  challengeCompleted: 10,
  reviewCompleted: 3,
};

// Las insignias de racha: cuántos días hacen falta y cuántos destellos dan
export const STREAK_BADGES = [
  { days: 7, glints: 20 },
  { days: 30, glints: 60 },
  { days: 100, glints: 200 },
] as const;

export type BadgeInfo = { days: number; earnedAt: Date };
export type NewBadge = BadgeInfo & { glints: number }; // los destellos que dio

// Da destellos solo si nunca los dio por este mismo motivo. Devuelve cuántos dio
export async function awardGlints(user: User, reason: GlintReason, referenceId: string, amount: number, t: Transaction) {
  const already = await GlintEvent.findOne({
    where: { userId: user.id, reason, referenceId },
    transaction: t,
  });
  if (already) return 0;

  await GlintEvent.create({ userId: user.id, reason, referenceId, amount }, { transaction: t });
  await user.increment("glints", { by: amount, transaction: t });
  return amount;
}

// Gasta destellos: un movimiento negativo y el saldo baja. Quien llama ya verificó que le alcanzan
// (y si no, la restricción de la base, que no deja el saldo en negativo, frena todo).
export async function spendGlints(user: User, reason: GlintReason, referenceId: string, price: number, t: Transaction) {
  await GlintEvent.create({ userId: user.id, reason, referenceId, amount: -price }, { transaction: t });
  await user.decrement("glints", { by: price, transaction: t });
}

// Da las insignias que la racha ya alcanzó y todavía no tenía, con sus destellos.
// Se llama dentro de una transacción que ya bloqueó al alumno. Devuelve las nuevas (casi siempre ninguna)
export async function awardStreakBadges(user: User, streak: number, t: Transaction) {
  const earned: NewBadge[] = [];
  for (const badge of STREAK_BADGES) {
    if (streak < badge.days) continue;
    const [row, created] = await StreakBadge.findOrCreate({
      where: { userId: user.id, days: badge.days },
      transaction: t,
    });
    if (!created) continue;
    const glints = await awardGlints(user, "streak_badge", row.id, badge.glints, t);
    earned.push({ days: badge.days, earnedAt: row.earnedAt, glints });
  }
  return earned;
}

export async function badgesOf(userId: string): Promise<BadgeInfo[]> {
  const rows = await StreakBadge.findAll({ where: { userId }, order: [["days", "ASC"]] });
  return rows.map((r) => ({ days: r.days, earnedAt: r.earnedAt }));
}
