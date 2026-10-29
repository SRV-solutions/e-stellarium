import { afterAll, beforeEach, vi } from "vitest";
import { sequelize } from "../src/db.js";

// Reemplazamos el envío de mails por una función falsa que registra cada llamada
vi.mock("../src/lib/mailer.js", () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  // Vacía los datos que generan los tests. CASCADE vacía también las tablas que dependen de users.
  await sequelize.query("TRUNCATE users, processed_payments, constellations RESTART IDENTITY CASCADE");
});

afterAll(async () => {
  await sequelize.close();
});