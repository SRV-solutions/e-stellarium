import { createHash, randomBytes } from "node:crypto";
import type { Transaction } from "sequelize";
import { PasswordToken } from "../models/index.js";
import type { PasswordTokenType } from "../models/PasswordToken.js";

const TTL_HOURS: Record<PasswordTokenType, number> = {
  set_password: 72,
  reset_password: 1,
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Crea el token, guarda solo su hash y devuelve el token original para el link del mail
export async function createPasswordToken(
  userId: string,
  type: PasswordTokenType,
  transaction?: Transaction
) {
  const token = randomBytes(32).toString("base64url");
  await PasswordToken.create(
    {
      userId,
      type,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TTL_HOURS[type] * 60 * 60 * 1000),
    },
    { transaction }
  );
  return token;
}