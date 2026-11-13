import { Router } from "express";
import { User } from "../models/index.js";
import { verifyPassword, PASSWORD_MAX } from "../lib/password.js";
import { startSession, endSession } from "../lib/session.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { sessionUser } from "../lib/permissions.js";

export const authRouter = Router();

// Hash de una contraseña cualquiera, para comparar cuando el email no existe
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5O8fVZ0ZpD4D7kQ4tC0r3xY0iXyZ1yG";

authRouter.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return res.status(400).json({ error: "Escribí tu email y tu contraseña." });
  }
  if (password.length > PASSWORD_MAX) {
    return res.status(401).json({ error: "Email o contraseña incorrectos." });
  }

  const user = await User.scope("withPassword").findOne({
    where: { email: email.trim().toLowerCase() },
  });

  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  // Dado de baja: el mismo error, para no contar qué cuentas existen
  if (!user || !user.passwordHash || !ok || user.deletedAt) {
    return res.status(401).json({ error: "Email o contraseña incorrectos." });
  }

  startSession(res, user.id);
  res.json({ user: await sessionUser(user) });
});

authRouter.post("/auth/logout", (_req, res) => {
  endSession(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await sessionUser(req.user!) });
});