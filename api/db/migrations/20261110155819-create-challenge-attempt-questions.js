"use strict";

// Las preguntas del desafío de cada alumno, en orden, con su reloj
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("challenge_attempt_questions", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      attempt_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "challenge_attempts", key: "id" },
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
        allowNull: false,
      },
      part: {
        // own: de sus cursos; explore y discover: de cursos que no tiene
        type: Sequelize.ENUM("own", "explore", "discover"),
        allowNull: false,
      },
      shown_at: {
        type: Sequelize.DATE,
        allowNull: true, // vacío hasta que se le muestra: si nunca la vio, no cuenta como vista
      },
      deadline_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      answered_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      response: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      correct: {
        type: Sequelize.BOOLEAN,
        allowNull: true, // vacío hasta que responde o se le vence el tiempo
      },
    });

    await queryInterface.addConstraint("challenge_attempt_questions", {
      fields: ["attempt_id", "position"],
      type: "unique",
      name: "challenge_attempt_questions_attempt_position_unique",
    });
    await queryInterface.addConstraint("challenge_attempt_questions", {
      fields: ["attempt_id", "question_id"],
      type: "unique",
      name: "challenge_attempt_questions_attempt_question_unique",
    });
    await queryInterface.addConstraint("challenge_attempt_questions", {
      fields: ["position"],
      type: "check",
      where: { position: { [Sequelize.Op.gte]: 1 } },
      name: "challenge_attempt_questions_position_positive",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("challenge_attempt_questions");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_challenge_attempt_questions_part";');
  },
};
