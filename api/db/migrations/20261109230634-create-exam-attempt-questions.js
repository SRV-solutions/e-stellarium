"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("exam_attempt_questions", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      attempt_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "exam_attempts", key: "id" },
        onDelete: "CASCADE",
      },
      question_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "questions", key: "id" },
        onDelete: "RESTRICT",
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false, // 1 a 10, el orden en que se muestran
      },
      shown_at: {
        type: Sequelize.DATE,
        allowNull: true, // vacío hasta que se le muestra
      },
      deadline_at: {
        type: Sequelize.DATE,
        allowNull: true, // shown_at + el tiempo del juego
      },
      answered_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      response: {
        type: Sequelize.JSONB,
        allowNull: true, // las posiciones que mandó el navegador
      },
      correct: {
        type: Sequelize.BOOLEAN,
        allowNull: true, // vacío hasta que responde o se le vence el tiempo
      },
    });

    await queryInterface.addConstraint("exam_attempt_questions", {
      fields: ["attempt_id", "position"],
      type: "unique",
      name: "exam_attempt_questions_attempt_position_unique",
    });

    await queryInterface.addConstraint("exam_attempt_questions", {
      fields: ["attempt_id", "question_id"],
      type: "unique",
      name: "exam_attempt_questions_attempt_question_unique",
    });

    await queryInterface.addConstraint("exam_attempt_questions", {
      fields: ["position"],
      type: "check",
      where: { position: { [Sequelize.Op.gte]: 1 } },
      name: "exam_attempt_questions_position_positive",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("exam_attempt_questions");
  },
};
