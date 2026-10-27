"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("products", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      key: {
        type: Sequelize.STRING(60),
        allowNull: false,
        unique: true, // igual a la clave de CURSOS en el Apps Script
      },
      name: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      drive_url: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("products");
  },
};