import type { RequestHandler } from "express";
import { clientIp } from "../lib/clientIp.js";
import { HttpError } from "../lib/errors.js";

// Límite de pedidos por minuto, por IP, para las rutas abiertas a cualquiera (la demo).
// Se lleva en memoria: con varias instancias cada una cuenta por su lado (el límite real es un poco mayor),
// y al reiniciar se borra. Para frenar abusos automatizados alcanza; lo que de verdad se cuida
// (un cupón por email, pocos por IP al día) lo garantiza la base.
export function rateLimit(max: number, windowMs = 60_000): RequestHandler {
  const hits = new Map<string, number[]>();

  return (req, _res, next) => {
    const now = Date.now();
    const key = clientIp(req) ?? "desconocida";
    const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);

    if (recent.length >= max) {
      hits.set(key, recent);
      return next(new HttpError(429, "Hiciste muchos pedidos seguidos. Esperá un minuto y probá de nuevo."));
    }
    recent.push(now);
    hits.set(key, recent);

    // Para que el mapa no crezca sin fin: de vez en cuando se sacan las IP sin pedidos recientes
    if (hits.size > 5000) {
      for (const [ip, times] of hits) if (times.every((at) => now - at >= windowMs)) hits.delete(ip);
    }
    next();
  };
}
