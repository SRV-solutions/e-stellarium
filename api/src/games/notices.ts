import { Op, QueryTypes } from "sequelize";
import { sequelize } from "../db.js";
import { ChallengeAttempt, Coupon, CouponVoid, Notification, type User } from "../models/index.js";
import { argentinaHour, hourOf, notify, weekdayOf } from "../lib/notify.js";
import { addDays, argentinaDay, currentStreak } from "./streak.js";
import { loadEconomy } from "./economy.js";
import { currentChallenge } from "./challengeFlow.js";

// Lo que dura un aviso leído antes de borrarse (no es registro de nada)
export const KEEP_READ_DAYS = 90;
// Cuántos muestra la campanita
export const LIST_LIMIT = 30;
// Desde qué hora de Argentina se avisa que la racha está en riesgo
export const STREAK_RISK_HOUR = 18;
// Cuántos días antes de vencer se avisa un cupón
export const COUPON_WARN_DAYS = 2;

// Los avisos que dependen de la hora no tienen un proceso que los cree: se crean acá, cuando la
// persona pide la campanita (al cargar la app, al volver a la pestaña y cada un minuto). Cada uno
// tiene una clave única por persona, así se crea una sola vez aunque se pida muchas veces.
export async function refreshNotices(user: User, now = new Date()) {
  await sequelize.transaction(async (t) => {
    const today = argentinaDay(now);

    // ---- Racha en riesgo: tiene racha, hoy no jugó y ya son las 18 ----
    const economy = await loadEconomy(t);
    const { streak, activeToday, freezes, boughtFreezes } = currentStreak(user, today, economy.freezes.freePerMonth);
    // El de otro día ya no sirve, y el de hoy tampoco si ya jugó: se borran si no los leyó
    await Notification.destroy({
      where: {
        userId: user.id,
        kind: "streak_risk",
        readAt: null,
        ...(activeToday ? {} : { key: { [Op.ne]: `streak_risk:${today}` } }),
      },
      transaction: t,
    });
    if (streak > 0 && !activeToday && argentinaHour(now) >= STREAK_RISK_HOUR) {
      const days = streak === 1 ? "1 día" : `${streak} días`;
      const shield = freezes + boughtFreezes > 0 ? " Si no, se usa un protector." : "";
      await notify(t, [user.id], {
        kind: "streak_risk",
        title: `Tu racha de ${days} está en riesgo`,
        body: `Todavía no jugaste hoy. Con una estrella o el repaso del día alcanza.${shield}`,
        link: "/review",
        key: `streak_risk:${today}`,
      });
    }

    // ---- Cupones por vencer: sin usar, sin anular, vencen en 2 días o menos ----
    const soon = await Coupon.findAll({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { [Op.gt]: now, [Op.lte]: new Date(now.getTime() + COUPON_WARN_DAYS * 86_400_000) },
        "$CouponVoid.id$": null,
      },
      include: [{ model: CouponVoid, required: false }],
      transaction: t,
    });
    for (const coupon of soon) {
      const day = argentinaDay(coupon.expiresAt);
      const when = day === today ? "hoy" : day === addDays(today, 1) ? "mañana" : `el ${weekdayOf(coupon.expiresAt)}`;
      await notify(t, [user.id], {
        kind: "coupon_expiring",
        title: `Tu cupón del ${coupon.percent} % vence ${when}`,
        body: `${coupon.code}, para cualquier curso de SRV. Vence a las ${hourOf(coupon.expiresAt)}.`,
        link: "/#mis-cupones",
        key: `coupon_expiring:${coupon.id}`,
      });
    }

    // ---- Desafío nuevo: tiene algún curso con constelación y todavía no lo empezó ----
    const [{ count }] = await sequelize.query<{ count: string }>(
      `SELECT count(*) AS count FROM enrollments e JOIN constellations c ON c.product_id = e.product_id
        WHERE e.user_id = :userId AND e.status = 'active'`,
      { replacements: { userId: user.id }, type: QueryTypes.SELECT, transaction: t }
    );
    if (Number(count) > 0) {
      const challenge = await currentChallenge(now, t);
      const started = await ChallengeAttempt.count({ where: { userId: user.id, challengeId: challenge.id }, transaction: t });
      if (!started) {
        await notify(t, [user.id], {
          kind: "challenge",
          title: `Salió el desafío del ${weekdayOf(challenge.publishedAt).split(" ")[0]}`,
          body: `Una sola vez, contra reloj. Cierra el ${weekdayOf(challenge.closesAt)} a las ${hourOf(challenge.closesAt)}.`,
          link: "/challenges",
          key: `challenge:${challenge.id}`,
        });
      }
    }
  });
}

export async function unreadCount(userId: string) {
  return Notification.count({ where: { userId, readAt: null } });
}

// Los últimos avisos. De paso borra los que leyó hace más de 90 días
export async function listNotices(userId: string, now = new Date()) {
  await Notification.destroy({
    where: { userId, readAt: { [Op.lt]: new Date(now.getTime() - KEEP_READ_DAYS * 86_400_000) } },
  });
  const rows = await Notification.findAll({
    where: { userId },
    order: [
      ["createdAt", "DESC"],
      ["id", "ASC"],
    ],
    limit: LIST_LIMIT,
  });
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    emailSent: n.emailSent,
    createdAt: n.createdAt,
    readAt: n.readAt,
  }));
}

// Marca como leídos los que se vieron (o todos, sin ids). Solo los suyos
export async function markRead(userId: string, ids: string[] | null, now = new Date()) {
  await Notification.update(
    { readAt: now },
    { where: { userId, readAt: null, ...(ids ? { id: ids } : {}) } }
  );
}
