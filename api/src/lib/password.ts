import bcrypt from "bcrypt";

const COST = 12;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // Max de Bcrypt

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}