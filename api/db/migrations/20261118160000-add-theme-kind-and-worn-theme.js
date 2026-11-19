"use strict";

// Los temas de la app (cosméticos de un tipo nuevo, "theme"): shop_items.kind gana el valor "theme" y users
// guarda el que lleva puesto (worn_theme; vacío = Marino, el de siempre). Como los demás cosméticos, solo se
// puede llevar puesto lo comprado: users_worn_theme_owned apunta a user_cosmetics.
// Un valor nuevo de un ENUM no se puede usar en la misma transacción en que se crea: los temas en sí los
// carga la migración siguiente. La tabla users cambia su to_jsonb: después del deploy, npm run seal-integrity.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`ALTER TYPE "enum_shop_items_kind" ADD VALUE IF NOT EXISTS 'theme'`);
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn("users", "worn_theme", { type: Sequelize.STRING(40), allowNull: true }, { transaction });
      await queryInterface.sequelize.query(
        `ALTER TABLE users ADD CONSTRAINT users_worn_theme_owned
           FOREIGN KEY (id, worn_theme) REFERENCES user_cosmetics (user_id, cosmetic_id)`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("users", "worn_theme", { transaction }); // se lleva su restricción
      // Un valor de un ENUM no se puede sacar: se vuelve a crear el tipo sin "theme" (la migración siguiente ya borró esas filas)
      // Las restricciones y el índice que comparan kind con el tipo viejo se sueltan y se vuelven a poner
      await queryInterface.sequelize.query(
        `ALTER TABLE shop_items
           DROP CONSTRAINT shop_items_percent_only_coupons,
           DROP CONSTRAINT shop_items_hex_only_colors,
           DROP CONSTRAINT shop_items_alt_name_only_titles,
           DROP CONSTRAINT shop_items_effect_only_colors`,
        { transaction }
      );
      await queryInterface.sequelize.query("DROP INDEX shop_items_one_freeze", { transaction });
      await queryInterface.sequelize.query(`ALTER TYPE "enum_shop_items_kind" RENAME TO "enum_shop_items_kind_old"`, { transaction });
      await queryInterface.sequelize.query(
        `CREATE TYPE "enum_shop_items_kind" AS ENUM ('coupon', 'streak_freeze', 'frame', 'color', 'title')`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE shop_items ALTER COLUMN kind TYPE "enum_shop_items_kind" USING kind::text::"enum_shop_items_kind"`,
        { transaction }
      );
      await queryInterface.sequelize.query(`DROP TYPE "enum_shop_items_kind_old"`, { transaction });
      await queryInterface.sequelize.query(
        `ALTER TABLE shop_items
           ADD CONSTRAINT shop_items_percent_only_coupons CHECK ((kind = 'coupon') = (percent IS NOT NULL)),
           ADD CONSTRAINT shop_items_hex_only_colors CHECK ((kind = 'color') = (hex IS NOT NULL)),
           ADD CONSTRAINT shop_items_alt_name_only_titles CHECK (alt_name IS NULL OR kind = 'title'),
           ADD CONSTRAINT shop_items_effect_only_colors
             CHECK (effect IS NULL OR (kind = 'color' AND effect IN ('twinkle', 'pulse', 'flow', 'comet', 'rainbow')))`,
        { transaction }
      );
      await queryInterface.sequelize.query("CREATE UNIQUE INDEX shop_items_one_freeze ON shop_items (kind) WHERE kind = 'streak_freeze'", { transaction });
    });
  },
};
