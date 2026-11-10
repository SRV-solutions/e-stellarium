"use strict";

// Las preguntas sin estrella se separan en dos grupos: las del examen y las de los desafíos.
// Así el alumno no ve en un desafío las preguntas que después le tocan en el examen.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("questions", "pool", {
      type: Sequelize.ENUM("exam", "challenge"),
      allowNull: true, // vacío en las preguntas de las lecciones
    });

    // Las que ya estaban sin estrella son todas del banco del examen
    await queryInterface.sequelize.query("UPDATE questions SET pool = 'exam' WHERE star_id IS NULL");

    // Una pregunta va en una estrella o en un grupo, nunca en los dos. Puede no estar en ninguno:
    // si se borra su estrella, queda suelta y no la usan ni el examen ni los desafíos.
    await queryInterface.addConstraint("questions", {
      fields: ["pool"],
      type: "check",
      where: Sequelize.literal("star_id IS NULL OR pool IS NULL"),
      name: "questions_star_or_pool",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint("questions", "questions_star_or_pool");
    await queryInterface.removeColumn("questions", "pool");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_questions_pool";');
  },
};
