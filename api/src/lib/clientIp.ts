import { isIP } from "node:net";
import type { Request } from "express";

// La IP del navegador, para la bitácora. Netlify la manda en x-nf-client-connection-ip en cada pedido
// que reenvía a Railway. No se puede contar saltos con "trust proxy": Netlify a veces pasa por uno y a
// veces por dos servidores (salían IPs de Amazon São Paulo en vez de la del navegador).
// Quien llame directo a la URL de Railway podría inventar esta cabecera, pero para dejar un registro
// hay que tener sesión de staff: a lo sumo alguien del staff disfraza su propia IP.
export function clientIp(req: Request): string | null {
  const header = req.get("x-nf-client-connection-ip")?.trim();
  if (header && isIP(header)) return header;
  return req.ip ?? null;
}
