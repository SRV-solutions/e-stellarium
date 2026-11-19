"use strict";

// Los temas de la tienda. Marino es el de siempre (gratis, de todos, como el azul del trazo). Cada tema es un
// bloque de variables de color en client/src/index.css ([data-theme="bordo"]...): el id es la clave.
// Filas sin dvh: después del deploy, npm run seal-integrity.

const ITEMS = [
  // [id, nombre, nota, precio]
  ["marino", "Marino", "El de siempre", 0],
  ["bordo", "Bordó", "Vino oscuro", 1000],
  ["bosque", "Bosque", "Verde profundo", 1000],
  ["ciruela", "Ciruela", "Violeta noche", 1000],
  ["grafito", "Grafito", "Gris carbón", 1000],
  ["cafe", "Café", "Marrón nocturno", 1000],
];
const IDS = ITEMS.map(([id]) => id);

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [[{ last }]] = await queryInterface.sequelize.query("SELECT COALESCE(MAX(position), -1) AS last FROM shop_items", { transaction });
      const now = new Date();
      await queryInterface.bulkInsert(
        "shop_items",
        ITEMS.map(([id, name, note, price], i) => ({
          id,
          kind: "theme",
          name,
          note,
          price,
          percent: null,
          hex: null,
          effect: null,
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
      await queryInterface.sequelize.query("UPDATE users SET worn_theme = NULL WHERE worn_theme IN (:ids)", { replacements, transaction });
      await queryInterface.sequelize.query("DELETE FROM user_cosmetics WHERE cosmetic_id IN (:ids)", { replacements, transaction });
      await queryInterface.sequelize.query("DELETE FROM shop_items WHERE id IN (:ids)", { replacements, transaction });
    });
  },
};
