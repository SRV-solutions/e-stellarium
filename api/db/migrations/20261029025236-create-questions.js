"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("questions", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "products", key: "id" },
        onDelete: "RESTRICT",
      },
      star_id: {
        type: Sequelize.UUID,
        allowNull: true, // vacío = solo banco
        references: { model: "stars", key: "id" },
        onDelete: "SET NULL",
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      type: {
        type: Sequelize.ENUM("output", "fill_blank", "order_lines", "multiple_choice"),
        allowNull: false,
      },
      difficulty: {
        type: Sequelize.ENUM("easy", "medium", "hard"),
        allowNull: false,
      },
      topic: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },
      prompt: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      content: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      answer: {
        type: Sequelize.JSONB,
        allowNull: false, // nunca sale de la API
      },
      explanation: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("draft", "in_review", "published", "rejected"),
        allowNull: false,
        defaultValue: "draft",
      },
      author_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
    });

    await queryInterface.addConstraint("questions", {
      fields: ["star_id", "position"],
      type: "unique",
      name: "questions_star_position_unique",
    });

    await queryInterface.addIndex("questions", ["product_id", "status", "difficulty"], {
      name: "questions_bank_lookup",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("questions");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_questions_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_questions_difficulty";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_questions_status";');
  },
};