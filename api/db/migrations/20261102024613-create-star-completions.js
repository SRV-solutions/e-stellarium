"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("star_completions", {
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
        allowNull: false,
        references: { model: "stars", key: "id" },
        onDelete: "CASCADE",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
    });

    await queryInterface.addConstraint("star_completions", {
      fields: ["user_id", "star_id"],
      type: "unique",
      name: "star_completions_user_star_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("star_completions");
  },
};