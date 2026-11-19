import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { argentinaDay, currentStreak } from "../games/streak.js";
import { todayReviewSummary } from "../games/review.js";
import { badgesOf } from "../games/glints.js";
import { wear, type CosmeticKind } from "../games/cosmetics.js";
import { HttpError } from "../lib/errors.js";
import { ALIAS_COOLDOWN_DAYS, ALIAS_PATTERN, isBlockedAlias } from "../lib/alias.js";
import { isAvatar } from "../lib/avatars.js";
import { loadEconomy } from "../games/economy.js";
import { sequelize } from "../db.js";
import { User } from "../models/index.js";

export const meRouter = Router();

// La racha, los protectores, cómo va el repaso de hoy, los destellos y las insignias.
// Solo lee: si la racha se cortó, muestra 0
meRouter.get("/me/stats", requireAuth, async (req, res) => {
  const user = req.user!;
  const now = new Date();
  const economy = await loadEconomy();
  const { streak, freezes, boughtFreezes, activeToday } = currentStreak(
    user,
    argentinaDay(now),
    economy.freezes.freePerMonth
  );

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
  if (kind !== "frame" && kind !== "color" && kind !== "title" && kind !== "theme") throw new HttpError(400, "No existe ese tipo de cosmético.");
  if (id !== null && typeof id !== "string") throw new HttpError(400, "Falta el cosmético.");
  if (variant !== 0 && variant !== 1) throw new HttpError(400, "La forma del título tiene que ser 0 o 1.");
  res.json({ worn: await wear(req.user!.id, kind as CosmeticKind, id, variant) });
});

// Las preferencias, por separado: los mails que se pueden desactivar y los avisos de la campanita.
// Los mails de cuenta (contraseña, cursos, cupones) no dependen de esto. Se manda uno o los dos.
meRouter.patch("/me/preferences", requireAuth, async (req, res) => {
  const { notifyEmail, notifyApp } = req.body ?? {};
  const changes: { notifyEmail?: boolean; notifyApp?: boolean } = {};
  for (const [key, value] of Object.entries({ notifyEmail, notifyApp })) {
    if (value === undefined) continue;
    if (typeof value !== "boolean") throw new HttpError(400, "Cada preferencia es sí o no.");
    changes[key as keyof typeof changes] = value;
  }
  if (!Object.keys(changes).length) throw new HttpError(400, "No hay nada para cambiar.");

  // users es una tabla protegida: se escribe dentro de una transacción (ahí se sellan sus dígitos)
  const user = await sequelize.transaction(async (t) => {
    const row = await User.findByPk(req.user!.id, { lock: t.LOCK.UPDATE, transaction: t });
    if (!row) throw new HttpError(404, "No encontramos al usuario.");
    return row.update(changes, { transaction: t });
  });
  res.json({ notifyEmail: user.notifyEmail, notifyApp: user.notifyApp });
});

// Cambia el alias: de 3 a 20 caracteres, sin nombres que se hagan pasar por el staff, y una vez cada
// 30 días (sale en el ranking). Puede repetirse con el de otra persona: el que identifica es el email.
meRouter.patch("/me/alias", requireAuth, async (req, res) => {
  const alias = typeof req.body?.alias === "string" ? req.body.alias.trim() : "";
  if (!ALIAS_PATTERN.test(alias)) throw new HttpError(400, "El alias tiene de 3 a 20 caracteres: letras, números, guion y guion bajo.");
  if (isBlockedAlias(alias)) throw new HttpError(400, "Ese alias no está disponible. Probá con otro.");

  const user = await sequelize.transaction(async (t) => {
    const row = await User.findByPk(req.user!.id, { lock: t.LOCK.UPDATE, transaction: t });
    if (!row) throw new HttpError(404, "No encontramos al usuario.");
    if (row.alias === alias) return row;
    const next = row.aliasChangedAt && new Date(row.aliasChangedAt.getTime() + ALIAS_COOLDOWN_DAYS * 86_400_000);
    if (next && next > new Date()) {
      const days = Math.ceil((next.getTime() - Date.now()) / 86_400_000);
      throw new HttpError(429, `Ya cambiaste el alias hace poco. Podés volver a cambiarlo en ${days === 1 ? "1 día" : `${days} días`}.`);
    }
    return row.update({ alias, aliasChangedAt: new Date() }, { transaction: t });
  });
  res.json({ alias: user.alias, aliasChangedAt: user.aliasChangedAt });
});

// El dibujo del avatar, de la lista de lib/avatars.ts (null = las iniciales)
meRouter.patch("/me/avatar", requireAuth, async (req, res) => {
  const avatar = req.body?.avatar;
  if (avatar !== null && !isAvatar(avatar)) throw new HttpError(400, "No existe ese dibujo.");
  const user = await sequelize.transaction(async (t) => {
    const row = await User.findByPk(req.user!.id, { lock: t.LOCK.UPDATE, transaction: t });
    if (!row) throw new HttpError(404, "No encontramos al usuario.");
    return row.update({ avatar }, { transaction: t });
  });
  res.json({ avatar: user.avatar });
});
