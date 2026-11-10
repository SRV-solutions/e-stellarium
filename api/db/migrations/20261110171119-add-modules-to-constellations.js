"use strict";

// Los módulos del curso, como en la guía: [{ number: 1, title: "Primeros pasos", classes: "1-7" }, ...]
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("constellations", "modules", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("constellations", "modules");
  },
};
