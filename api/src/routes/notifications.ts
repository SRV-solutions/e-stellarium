import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { HttpError } from "../lib/errors.js";
import { isUuid } from "../lib/uuid.js";
import { listNotices, markRead, refreshNotices, unreadCount } from "../games/notices.js";

export const notificationsRouter = Router();

// Lo que pide la campanita cada un minuto. Antes crea los avisos que dependen de la hora
// (racha en riesgo, cupón por vencer, desafío nuevo)
notificationsRouter.get("/notifications/unread-count", requireAuth, async (req, res) => {
  await refreshNotices(req.user!);
  res.json({ count: await unreadCount(req.user!.id) });
});

// Los últimos 30 avisos, los más nuevos arriba, y cuántos no leyó
notificationsRouter.get("/notifications", requireAuth, async (req, res) => {
  await refreshNotices(req.user!);
  res.json({ items: await listNotices(req.user!.id), unread: await unreadCount(req.user!.id) });
});

// Marca como leídos los que se vieron: { ids } (sin ids, todos)
notificationsRouter.post("/notifications/read", requireAuth, async (req, res) => {
  const { ids } = req.body ?? {};
  if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || !ids.every((id) => typeof id === "string" && isUuid(id)))) {
    throw new HttpError(400, "Los avisos no son válidos.");
  }
  await markRead(req.user!.id, ids ?? null);
  res.json({ unread: await unreadCount(req.user!.id) });
});
