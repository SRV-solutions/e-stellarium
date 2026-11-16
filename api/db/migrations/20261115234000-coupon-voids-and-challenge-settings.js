"use strict";

// Bloque 5, paso 5b:
// - coupon_voids: los cupones anulados desde el panel (una fila por cupón, con el motivo). Es una tabla
//   aparte, y no columnas nuevas en coupons, para no cambiar el dvh de todos los cupones que ya existen.
//   Es protegida (dvh y el trigger de integridad): borrar la fila a mano revive el cupón, y eso se tiene
//   que notar. Revertir una anulación desde la bitácora borra la fila (sellado, en una transacción).
// - settings: el horario y la receta de los desafíos, con los valores que estaban en el código
//   (lunes y sábados a las 9; 2/2/2 de sus cursos con 2 de repaso, 2/1/0 de Explorá y 1/0/0 de Descubrí).
//   Las filas se crean sin dvh: después del deploy hay que sellarlas (npm run seal-integrity).

const CHALLENGE_SETTINGS = {
  "challenge.day_mon": 1,
  "challenge.day_tue": 0,
  "challenge.day_wed": 0,
  "challenge.day_thu": 0,
  "challenge.day_fri": 0,
  "challenge.day_sat": 1,
  "challenge.day_sun": 0,
  "challenge.hour": 9,
  "challenge.own_easy": 2,
  "challenge.own_medium": 2,
  "challenge.own_hard": 2,
  "challenge.own_review": 2,
  "challenge.explore_easy": 2,
  "challenge.explore_medium": 1,
  "challenge.explore_hard": 0,
  "challenge.discover_easy": 1,
  "challenge.discover_medium": 0,
  "challenge.discover_hard": 0,
};

const ZERO = "0".repeat(64);

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "coupon_voids",
        {
          id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
          coupon_id: {
            type: Sequelize.UUID,
            allowNull: false,
            unique: true, // un cupón se anula una sola vez
            references: { model: "coupons", key: "id" },
            onDelete: "CASCADE",
          },
          reason: { type: Sequelize.TEXT, allowNull: false },
          voided_by: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onDelete: "SET NULL" },
          created_at: { type: Sequelize.DATE, allowNull: false },
          dvh: { type: Sequelize.CHAR(64), allowNull: true },
        },
        { transaction }
      );
      await queryInterface.sequelize.query(
        "ALTER TABLE coupon_voids ADD CONSTRAINT coupon_voids_reason_not_blank CHECK (btrim(reason) <> '')",
        { transaction }
      );
      await queryInterface.bulkInsert("integrity", [{ table_name: "coupon_voids", dvv: ZERO }], { transaction });
      await queryInterface.sequelize.query(
        `CREATE TRIGGER coupon_voids_integrity AFTER INSERT OR UPDATE OR DELETE ON coupon_voids
           FOR EACH ROW EXECUTE FUNCTION integrity_track();`,
        { transaction }
      );

      const now = new Date();
      await queryInterface.bulkInsert(
        "settings",
        Object.entries(CHALLENGE_SETTINGS).map(([id, value]) => ({ id, value, updated_at: now })),
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Se borran las filas de settings y lo que el trigger anotó para sellar. Si ya estaban selladas,
      // después de deshacer hay que volver a sellar (npm run seal-integrity): el DVV las sigue contando
      await queryInterface.bulkDelete("settings", { id: Object.keys(CHALLENGE_SETTINGS) }, { transaction });
      await queryInterface.bulkDelete("integrity_pending", { table_name: "coupon_voids" }, { transaction });
      await queryInterface.sequelize.query(
        "DELETE FROM integrity_pending WHERE table_name = 'settings' AND row_id LIKE 'challenge.%'",
        { transaction }
      );
      await queryInterface.bulkDelete("integrity", { table_name: "coupon_voids" }, { transaction });
      await queryInterface.dropTable("coupon_voids", { transaction }); // se lleva su trigger y restricciones
    });
  },
};
