"use strict";

// El módulo del curso donde se aprende lo que pregunta. En un desafío, si el alumno erra,
// se le dice dónde verlo.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("questions", "module", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("questions", "module");
  },
};
