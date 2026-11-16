import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { hmac } from "./hmac.js";
import { isUuid } from "./uuid.js";

// El token de la baja con un clic: el id de la persona y un HMAC de ese id. No se guarda nada
// (sin clave secreta nadie puede armar uno) y no vence: un mail viejo tiene que seguir sirviendo.
// Solo sirve para desactivar el mail de desafíos, nada más.
export function unsubscribeToken(userId: string) {
  return `${userId}.${hmac(`unsubscribe:${userId}`)}`;
}

// El link va por el proxy de Netlify (/api), como el resto de la API
export function unsubscribeLink(userId: string) {
  return `${config.appUrl}/api/unsubscribe?token=${unsubscribeToken(userId)}`;
}

// Devuelve el id de la persona, o null si el token no es válido
export function userIdFromUnsubscribeToken(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const [userId, signature, ...rest] = token.split(".");
  if (rest.length || !userId || !signature || !isUuid(userId)) return null;
  const expected = Buffer.from(hmac(`unsubscribe:${userId}`));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}
