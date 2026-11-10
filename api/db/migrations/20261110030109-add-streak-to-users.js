"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "users",
        "streak",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction }
      );
      await queryInterface.addColumn(
        "users",
        "last_active_on",
        { type: Sequelize.DATEONLY, allowNull: true }, // el último día que jugó, en hora de Argentina
        { transaction }
      );
      await queryInterface.addColumn(
        "users",
        "streak_freezes",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 2 }, // los protectores del mes de last_active_on
        { transaction }
      );

      await queryInterface.addConstraint("users", {
        fields: ["streak"],
        type: "check",
        where: { streak: { [Sequelize.Op.gte]: 0 } },
        name: "users_streak_not_negative",
        transaction,
      });
      await queryInterface.addConstraint("users", {
        fields: ["streak_freezes"],
        type: "check",
        where: { streak_freezes: { [Sequelize.Op.between]: [0, 2] } },
        name: "users_streak_freezes_range",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Al borrar las columnas se borran también sus restricciones
      await queryInterface.removeColumn("users", "streak_freezes", { transaction });
      await queryInterface.removeColumn("users", "last_active_on", { transaction });
      await queryInterface.removeColumn("users", "streak", { transaction });
    });
  },
};
