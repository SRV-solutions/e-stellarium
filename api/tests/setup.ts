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
  // La economía vuelve a los valores de la migración, por si un test la cambió. Lo comprado ya se
  // vació con users (CASCADE), así que la tienda se puede rearmar entera
  await sequelize.query(`
    UPDATE settings SET value = v.value FROM (VALUES
      ('xp.question_correct', 10), ('xp.star_completed', 50), ('xp.exam_passed', 100),
      ('xp.review_correct', 2), ('xp.review_completed', 10), ('xp.challenge_correct', 5),
      ('xp.challenge_completed', 20), ('glints.review_completed', 3), ('glints.challenge_correct', 3),
      ('glints.challenge_completed', 10), ('glints.badge_7', 20), ('glints.badge_30', 60),
      ('glints.badge_100', 200), ('streak.free_freezes', 2), ('shop.freezes_per_month', 2),
      ('coupon.first_percent', 60), ('coupon.later_percent', 40), ('coupon.valid_days', 60),
      ('challenge.day_mon', 1), ('challenge.day_tue', 0), ('challenge.day_wed', 0), ('challenge.day_thu', 0),
      ('challenge.day_fri', 0), ('challenge.day_sat', 1), ('challenge.day_sun', 0), ('challenge.hour', 9),
      ('challenge.own_easy', 2), ('challenge.own_medium', 2), ('challenge.own_hard', 2), ('challenge.own_review', 2),
      ('challenge.explore_easy', 2), ('challenge.explore_medium', 1), ('challenge.explore_hard', 0),
      ('challenge.discover_easy', 1), ('challenge.discover_medium', 0), ('challenge.discover_hard', 0)
    ) AS v(id, value) WHERE settings.id = v.id;
    DELETE FROM shop_items;
    INSERT INTO shop_items (id, kind, name, note, price, percent, hex, alt_name, position, created_at, updated_at) VALUES
      ('coupon_10', 'coupon', 'Cupón del 10 %', '', 150, 10, NULL, NULL, 0, now(), now()),
      ('coupon_20', 'coupon', 'Cupón del 20 %', '', 350, 20, NULL, NULL, 1, now(), now()),
      ('coupon_30', 'coupon', 'Cupón del 30 %', '', 700, 30, NULL, NULL, 2, now(), now()),
      ('streak_freeze', 'streak_freeze', 'Protector de racha', 'No vence', 60, NULL, NULL, NULL, 3, now(), now()),
      ('orbit', 'frame', 'Órbita', 'Una luna que gira', 120, NULL, NULL, NULL, 4, now(), now()),
      ('eclipse', 'frame', 'Eclipse', 'Corona de luz', 200, NULL, NULL, NULL, 5, now(), now()),
      ('rings', 'frame', 'Anillos', 'Como Saturno', 300, NULL, NULL, NULL, 6, now(), now()),
      ('blue', 'color', 'Azul', 'El de siempre', 0, NULL, '#4fa3ff', NULL, 7, now(), now()),
      ('aurora', 'color', 'Aurora', 'Verde polar', 150, NULL, '#3fe0a2', NULL, 8, now(), now()),
      ('nebula', 'color', 'Nebulosa', 'Violeta', 150, NULL, '#b9a6ff', NULL, 9, now(), now()),
      ('corona', 'color', 'Corona solar', 'Oro', 250, NULL, '#ffc94a', NULL, 10, now(), now()),
      ('comet_hunter', 'title', 'Cazadora de cometas', 'o Cazador', 100, NULL, NULL, 'Cazador de cometas', 11, now(), now()),
      ('navigator', 'title', 'Navegante', '', 100, NULL, NULL, NULL, 12, now(), now()),
      ('astronomer', 'title', 'Astrónoma de guardia', 'o Astrónomo', 180, NULL, NULL, 'Astrónomo de guardia', 13, now(), now());
  `);
  // Todo sellado al empezar: los DVH y DVV coinciden con la base vacía
  await sealAll();
});

afterAll(async () => {
  await sequelize.close();
});