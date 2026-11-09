"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("exam_attempts", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      star_id: {
        type: Sequelize.UUID,
        allowNull: false, // la estrella de examen
        references: { model: "stars", key: "id" },
        onDelete: "CASCADE",
      },
      number: {
        type: Sequelize.INTEGER,
        allowNull: false, // 1 en el primer intento, 2 en el segundo...
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
      finished_at: {
        type: Sequelize.DATE,
        allowNull: true, // vacío mientras está en curso
      },
      correct_count: {
        type: Sequelize.INTEGER,
        allowNull: true, // se completa al terminar
      },
      passed: {
        type: Sequelize.BOOLEAN,
        allowNull: true, // se completa al terminar
      },
    });

    await queryInterface.addConstraint("exam_attempts", {
      fields: ["user_id", "star_id", "number"],
      type: "unique",
      name: "exam_attempts_user_star_number_unique",
    });

    // Un solo intento en curso por alumno y examen
    await queryInterface.addIndex("exam_attempts", ["user_id", "star_id"], {
      unique: true,
      where: { finished_at: null },
      name: "exam_attempts_one_in_progress",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("exam_attempts");
  },
};
