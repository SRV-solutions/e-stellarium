import bcrypt from "bcrypt";

const COST = 12;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // Max de Bcrypt

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain.normalize("NFC"), COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain.normalize("NFC"), hash);
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || !password) {
    return "Escribí una contraseña.";
  }
  if (password.length < PASSWORD_MIN) {
    return `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.`;
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX) {
    return "La contraseña es demasiado larga.";
  }
  return null;
}