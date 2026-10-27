import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const KEY = process.env.INTERNAL_API_KEY;
if (!KEY) throw new Error("Falta INTERNAL_API_KEY en las variables de entorno");

export function requireInternalKey(req: Request, res: Response, next: NextFunction) {
  const received = Buffer.from(req.header("x-api-key") ?? "");
  const expected = Buffer.from(KEY!);

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    res.status(401).json({ error: "No autorizado." });
    return;
  }
  next();
}