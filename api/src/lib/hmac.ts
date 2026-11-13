import { createHmac } from "node:crypto";
import { config } from "../config.js";

// HMAC-SHA256 con la clave secreta: sin la clave, nadie puede recalcularlo a mano
export function hmac(text: string): string {
  return createHmac("sha256", config.integritySecret).update(text).digest("hex");
}

// JSON con las claves ordenadas, para que el mismo objeto dé siempre el mismo texto
// (Postgres guarda los jsonb con las claves en otro orden)
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
