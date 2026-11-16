import { randomInt } from "node:crypto";
import type { Transaction } from "sequelize";
import { User } from "../models/index.js";

const WORDS = ["cometa", "nebulosa", "orbita", "quasar", "pulsar", "nova", "astro", "lunar", "galaxia", "meteoro"];

export async function generateUniqueAlias(transaction?: Transaction) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const alias = `${WORDS[randomInt(WORDS.length)]}-${randomInt(1000, 10000)}`;
    const taken = await User.findOne({ where: { alias }, transaction });
    if (!taken) return alias;
  }
  throw new Error("No se pudo generar un alias único");
}

// ---- Cambiar el alias (lo hace la persona desde su perfil) ----

export const ALIAS_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
export const ALIAS_COOLDOWN_DAYS = 30;

// Nombres que se harían pasar por el staff o por la marca, y unas pocas ofensas. Se compara sin
// guiones ni guion bajo y en minúsculas, y alcanza con que el alias lo contenga.
const BLOCKED = [
  "admin", "superadmin", "staff", "soporte", "moderador", "docente", "profesor", "wearesrv", "estellarium",
  "srv", "puta", "puto", "mierda", "pelotud", "boludo", "forro", "nazi",
];

export function isBlockedAlias(alias: string) {
  const plain = alias.toLowerCase().replace(/[-_]/g, "");
  return BLOCKED.some((word) => plain.includes(word));
}
