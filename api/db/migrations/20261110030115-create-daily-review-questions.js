"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("daily_review_questions", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      review_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "daily_reviews", key: "id" },
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
        allowNull: false, // de 1 a 5
      },
      correct: {
        type: Sequelize.BOOLEAN,
        allowNull: true, // vacío mientras no la respondió
      },
      answered_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addConstraint("daily_review_questions", {
      fields: ["position"],
      type: "check",
      where: { position: { [Sequelize.Op.between]: [1, 5] } },
      name: "daily_review_questions_position_range",
    });
    await queryInterface.addConstraint("daily_review_questions", {
      fields: ["review_id", "position"],
      type: "unique",
      name: "daily_review_questions_review_position_unique",
    });
    await queryInterface.addConstraint("daily_review_questions", {
      fields: ["review_id", "question_id"],
      type: "unique",
      name: "daily_review_questions_review_question_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("daily_review_questions");
  },
};
