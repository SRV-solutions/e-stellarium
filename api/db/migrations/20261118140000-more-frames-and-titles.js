"use strict";

// Segunda tanda de cosméticos de la tienda: diez marcos (cinco con animación, dos de más de 1000 destellos)
// y ocho títulos. Cada marco tiene su dibujo en client/src/components/Avatar/frames.tsx (la clave es el id).
// Los marcos no se pueden crear desde el panel, por eso van en una migración; los títulos también, para que
// salgan juntos. Las filas se crean sin dvh: después del deploy, npm run seal-integrity.

const ITEMS = [
  // [id, kind, nombre, nota, precio, otra forma del título]
  ["constellation", "frame", "Constelación", "Estrellas unidas por una línea", 220, null],
  ["pulsar", "frame", "Púlsar", "Dos haces de luz", 250, null],
  ["belt", "frame", "Cinturón", "Un anillo de asteroides", 180, null],
  ["double_orbit", "frame", "Doble órbita", "Dos lunas, una en cada sentido", 320, null],
  ["phases", "frame", "Fases", "Ocho lunas, de nueva a llena", 280, null],
  ["supernova", "frame", "Supernova", "Rayos y ondas de luz que se expanden", 600, null],
  ["black_hole", "frame", "Agujero negro", "Un disco de materia que gira", 750, null],
  ["aurora_borealis", "frame", "Aurora boreal", "Cintas de luz que cambian de color", 850, null],
  ["solar_system", "frame", "Sistema solar", "Tres planetas en órbita", 1200, null],
  ["galaxy", "frame", "Galaxia", "Brazos espirales y estrellas que titilan", 1500, null],
  ["curious", "title", "Curiosa", "o Curioso", 100, "Curioso"],
  ["constant", "title", "Constante", "", 100, null],
  ["bug_hunter", "title", "Cazabugs", "", 120, null],
  ["self_taught", "title", "Autodidacta", "", 150, null],
  ["future_dev", "title", "Futura dev", "o Futuro dev", 150, "Futuro dev"],
  ["ready_to_launch", "title", "Lista para despegar", "o Listo para despegar", 180, "Listo para despegar"],
  ["unstoppable", "title", "Imparable", "", 200, null],
  ["mind_in_orbit", "title", "Mente en órbita", "", 250, null],
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
        ITEMS.map(([id, kind, name, note, price, altName], i) => ({
          id,
          kind,
          name,
          note,
          price,
          percent: null,
          hex: null,
          alt_name: altName,
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
      // Quien ya los compró los pierde: primero se sacan de lo que lleva puesto, después de lo comprado
      await queryInterface.sequelize.query("UPDATE users SET worn_frame = NULL WHERE worn_frame IN (:ids)", { replacements, transaction });
      await queryInterface.sequelize.query("UPDATE users SET worn_title = NULL, title_variant = 0 WHERE worn_title IN (:ids)", { replacements, transaction });
      await queryInterface.sequelize.query("DELETE FROM user_cosmetics WHERE cosmetic_id IN (:ids)", { replacements, transaction });
      await queryInterface.sequelize.query("DELETE FROM shop_items WHERE id IN (:ids)", { replacements, transaction });
    });
  },
};
