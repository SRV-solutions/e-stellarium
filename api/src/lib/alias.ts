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