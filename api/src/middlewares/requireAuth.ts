import type { Request, Response, NextFunction } from "express";
import { User } from "../models/index.js";
import { SESSION_COOKIE, endSession, readSession } from "../lib/session.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  const userId = token ? readSession(token) : null;
  if (!userId) {
    return res.status(401).json({ error: "Tenés que iniciar sesión." });
  }

  const user = await User.findByPk(userId);
  if (!user) {
    endSession(res);
    return res.status(401).json({ error: "Tenés que iniciar sesión." });
  }

  req.user = user;
  next();
}