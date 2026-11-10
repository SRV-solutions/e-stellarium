"use strict";

// Las estrellas se identifican por su slug, como las preguntas. Así se pueden insertar y reordenar
// lecciones sin que una estrella "se convierta" en otra (el progreso sigue a la estrella, no al lugar).
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("stars", "slug", {
      type: Sequelize.STRING(80),
      allowNull: true, // las que ya existían lo reciben en la primera carga con slugs
      unique: true,
    });
    await queryInterface.addColumn("stars", "module", {
      type: Sequelize.INTEGER,
      allowNull: true, // el módulo del curso que repasa (vacío en el examen)
    });

    // Diferida, como la de las preguntas: al reordenar, dos estrellas pueden tener el mismo lugar
    // por un momento dentro de la transacción
    await queryInterface.sequelize.query(`
      ALTER TABLE stars DROP CONSTRAINT stars_constellation_position_unique;
      ALTER TABLE stars ADD CONSTRAINT stars_constellation_position_unique
        UNIQUE (constellation_id, position) DEFERRABLE INITIALLY DEFERRED;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE stars DROP CONSTRAINT stars_constellation_position_unique;
      ALTER TABLE stars ADD CONSTRAINT stars_constellation_position_unique
        UNIQUE (constellation_id, position);
    `);
    await queryInterface.removeColumn("stars", "module");
    await queryInterface.removeColumn("stars", "slug");
  },
};
