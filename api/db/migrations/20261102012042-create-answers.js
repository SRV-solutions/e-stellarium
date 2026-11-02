"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("answers", {
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
      question_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "questions", key: "id" },
        onDelete: "RESTRICT",
      },
      context: {
        type: Sequelize.ENUM("star", "review", "challenge", "exam"),
        allowNull: false,
      },
      correct: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
      },
      response: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
    });

    await queryInterface.addIndex("answers", ["user_id", "question_id"], {
      name: "answers_user_question",
    });
    await queryInterface.addIndex("answers", ["user_id", "created_at"], {
      name: "answers_user_date",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("answers");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_answers_context";');
  },
};