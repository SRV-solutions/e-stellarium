"use strict";

// El desafío armado para cada alumno. Uno solo por alumno y desafío: un solo intento.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("challenge_attempts", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      challenge_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "challenges", key: "id" },
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true, // vacío hasta que aprieta "Empezar"
      },
      finished_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      correct_count: {
        type: Sequelize.INTEGER,
        allowNull: true, // se guarda al terminar; sirve también para dar puntos en el bloque 3
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
    });

    await queryInterface.addConstraint("challenge_attempts", {
      fields: ["challenge_id", "user_id"],
      type: "unique",
      name: "challenge_attempts_challenge_user_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("challenge_attempts");
  },
};
