"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("processed_payments", {
      payment_id: {
        type: Sequelize.STRING(30),
        primaryKey: true, // No se puede repetir: IDEMPOTENCIA
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("processed_payments");
  },
};