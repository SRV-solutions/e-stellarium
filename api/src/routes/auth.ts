import { Router } from "express";
import { User } from "../models/index.js";
import { verifyPassword, PASSWORD_MAX } from "../lib/password.js";
import { startSession, endSession } from "../lib/session.js";
import { requireAuth } from "../middlewares/requireAuth.js";

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
  if (!user || !user.passwordHash || !ok) {
    return res.status(401).json({ error: "Email o contraseña incorrectos." });
  }

  startSession(res, user.id);
  const { passwordHash, ...publicUser } = user.toJSON();
  res.json({ user: publicUser });
});

authRouter.post("/auth/logout", (_req, res) => {
  endSession(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});