"use strict";

// Los colores de trazo con efecto: shop_items.effect (solo los colores) dice cómo se anima la línea de las
// constelaciones. Los dibuja el cliente (lib/trail.ts y los estilos de StarMap y CourseLine). Agrega cinco
// colores con efecto. Cambia el to_jsonb de shop_items: después del deploy, npm run seal-integrity.

const EFFECTS = ["twinkle", "pulse", "flow", "comet", "rainbow"];

const ITEMS = [
  // [id, nombre, nota, precio, hex, efecto]
  ["twinkle", "Titilar", "Estrellas que brillan a destiempo", 400, "#b9a6ff", "twinkle"],
  ["pulse", "Pulso", "La línea respira", 450, "#3fe0a2", "pulse"],
  ["flow", "Corriente", "Puntos de luz que recorren la línea", 550, "#4fa3ff", "flow"],
  ["comet", "Cometa", "Un destello viaja de estrella en estrella", 700, "#ffc94a", "comet"],
  ["rainbow", "Arcoíris", "El color recorre todo el espectro", 900, "#ff5ea0", "rainbow"],
];
const IDS = ITEMS.map(([id]) => id);

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn("shop_items", "effect", { type: Sequelize.STRING(12), allowNull: true }, { transaction });
      await queryInterface.sequelize.query(
        `ALTER TABLE shop_items
           ADD CONSTRAINT shop_items_effect_only_colors CHECK (effect IS NULL OR (kind = 'color' AND effect IN (${EFFECTS.map((e) => `'${e}'`).join(", ")})))`,
        { transaction }
      );

      const [[{ last }]] = await queryInterface.sequelize.query("SELECT COALESCE(MAX(position), -1) AS last FROM shop_items", { transaction });
      const now = new Date();
      await queryInterface.bulkInsert(
        "shop_items",
        ITEMS.map(([id, name, note, price, hex, effect], i) => ({
          id,
          kind: "color",
          name,
          note,
          price,
          percent: null,
          hex,
          effect,
          alt_name: null,
          position: last + 1 + i,
          active: true,
          created_at: now,
          updated_at: now,
        })),
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const replacements = { ids: IDS };
      // Quien ya los compró los pierde: vuelve al azul y se sacan de lo comprado
      await queryInterface.sequelize.query("UPDATE users SET worn_color = NULL WHERE worn_color IN (:ids)", { replacements, transaction });
      await queryInterface.sequelize.query("DELETE FROM user_cosmetics WHERE cosmetic_id IN (:ids)", { replacements, transaction });
      await queryInterface.sequelize.query("DELETE FROM shop_items WHERE id IN (:ids)", { replacements, transaction });
      await queryInterface.sequelize.query("ALTER TABLE shop_items DROP CONSTRAINT shop_items_effect_only_colors", { transaction });
      await queryInterface.removeColumn("shop_items", "effect", { transaction });
    });
  },
};
