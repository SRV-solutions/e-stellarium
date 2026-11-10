"use strict";

// Cada desafío periódico. No hace falta un proceso programado: la API crea la fila
// la primera vez que alguien lo pide después de la hora de publicación.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("challenges", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      published_at: {
        type: Sequelize.DATE,
        allowNull: false,
        unique: true, // uno solo por horario de publicación
      },
      closes_at: {
        type: Sequelize.DATE,
        allowNull: false, // cuando sale el siguiente
      },
      kind: {
        type: Sequelize.ENUM("auto", "manual"),
        allowNull: false,
        defaultValue: "auto", // "manual": armado a mano por un admin (todavía sin panel)
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
    });

    await queryInterface.addConstraint("challenges", {
      fields: ["closes_at"],
      type: "check",
      where: Sequelize.literal("closes_at > published_at"),
      name: "challenges_closes_after_publish",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("challenges");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_challenges_kind";');
  },
};
