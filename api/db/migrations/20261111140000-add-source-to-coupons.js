"use strict";

// Los cupones pueden salir de una constelación (aprobar el examen), de la tienda o cargados a mano.
// Solo los de constelación tienen constelación e intento de examen.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Los cupones que ya existen son todos de constelación: se crea con ese valor y después se saca
      // el valor por defecto, así cada cupón nuevo tiene que decir de dónde sale
      await queryInterface.addColumn(
        "coupons",
        "source",
        {
          type: Sequelize.ENUM("constellation", "shop", "manual"),
          allowNull: false,
          defaultValue: "constellation",
        },
        { transaction }
      );
      await queryInterface.sequelize.query('ALTER TABLE coupons ALTER COLUMN source DROP DEFAULT', { transaction });

      await queryInterface.changeColumn(
        "coupons",
        "constellation_id",
        { type: Sequelize.UUID, allowNull: true },
        { transaction }
      );
      await queryInterface.changeColumn(
        "coupons",
        "exam_attempt_id",
        { type: Sequelize.UUID, allowNull: true },
        { transaction }
      );

      // De constelación: con constelación e intento. Los otros: sin ninguno de los dos
      await queryInterface.sequelize.query(
        `ALTER TABLE coupons ADD CONSTRAINT coupons_source_matches CHECK (
           (source = 'constellation' AND constellation_id IS NOT NULL AND exam_attempt_id IS NOT NULL)
           OR (source <> 'constellation' AND constellation_id IS NULL AND exam_attempt_id IS NULL)
         )`,
        { transaction }
      );

      // Para contar rápido los cupones de la tienda de la semana
      await queryInterface.addIndex("coupons", ["user_id", "source", "created_at"], {
        name: "coupons_user_source_date",
        transaction,
      });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Las columnas vuelven a ser obligatorias: los cupones que no son de constelación no entran
      await queryInterface.sequelize.query("DELETE FROM coupons WHERE source <> 'constellation'", { transaction });
      await queryInterface.removeIndex("coupons", "coupons_user_source_date", { transaction });
      await queryInterface.removeConstraint("coupons", "coupons_source_matches", { transaction });
      await queryInterface.changeColumn(
        "coupons",
        "exam_attempt_id",
        { type: Sequelize.UUID, allowNull: false },
        { transaction }
      );
      await queryInterface.changeColumn(
        "coupons",
        "constellation_id",
        { type: Sequelize.UUID, allowNull: false },
        { transaction }
      );
      await queryInterface.removeColumn("coupons", "source", { transaction });
      await queryInterface.sequelize.query('DROP TYPE "enum_coupons_source"', { transaction });
    });
  },
};
