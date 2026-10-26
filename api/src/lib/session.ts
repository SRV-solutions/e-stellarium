import jwt from "jsonwebtoken";
import type { Response } from "express";

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error("Falta JWT_SECRET en las variables de entorno");

export const SESSION_COOKIE = "session";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function startSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, SECRET!, { expiresIn: "7d" });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // en producción, solo por HTTPS
    sameSite: "lax",
    maxAge: SEVEN_DAYS_MS,
    path: "/",
  });
}

export function endSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function readSession(token: string): string | null {
  try {
    const payload = jwt.verify(token, SECRET!) as jwt.JwtPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null; // firma inválida o vencido
  }
}