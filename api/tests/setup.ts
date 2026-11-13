import { afterAll, beforeEach, vi } from "vitest";
import { sequelize } from "../src/db.js";
import { sealAll } from "../src/lib/integrity.js";

// Reemplazamos el envío de mails por una función falsa que registra cada llamada
vi.mock("../src/lib/mailer.js", () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  // Vacía los datos que generan los tests. CASCADE vacía también las tablas que dependen de users.
  await sequelize.query(
    "TRUNCATE users, processed_payments, constellations, questions, answers, integrity_pending, integrity_checks RESTART IDENTITY CASCADE"
  );
  // Los permisos de cada rol vuelven a la matriz inicial (la de la migración), por si un test los cambió
  await sequelize.query(`
    DELETE FROM role_permissions;
    INSERT INTO role_permissions (role_id, permission_key) VALUES
      (2, 'content:edit'), (2, 'students:view'),
      (3, 'content:edit'), (3, 'content:approve'), (3, 'students:view'), (3, 'challenges:manage'),
      (3, 'economy:edit'), (3, 'users:manage'), (3, 'coupons:manage');
  `);
  // Todo sellado al empezar: los DVH y DVV coinciden con la base vacía
  await sealAll();
});

afterAll(async () => {
  await sequelize.close();
});