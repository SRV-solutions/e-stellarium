"use strict";

// Los protectores de racha comprados en la tienda. No vencen, así que van aparte de streak_freezes
// (que son los 2 gratis del mes y se recargan solos)
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "users",
        "bought_freezes",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction }
      );
      await queryInterface.addConstraint("users", {
        fields: ["bought_freezes"],
        type: "check",
        where: { bought_freezes: { [Sequelize.Op.gte]: 0 } },
        name: "users_bought_freezes_not_negative",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    // Al borrar la columna se borra también su restricción
    await queryInterface.removeColumn("users", "bought_freezes");
  },
};
