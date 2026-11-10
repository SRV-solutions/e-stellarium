"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("daily_reviews", {
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
      day: {
        type: Sequelize.DATEONLY,
        allowNull: false, // en hora de Argentina
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
      finished_at: {
        type: Sequelize.DATE,
        allowNull: true, // vacío hasta que responde la última
      },
    });

    await queryInterface.addConstraint("daily_reviews", {
      fields: ["user_id", "day"],
      type: "unique",
      name: "daily_reviews_user_day_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("daily_reviews");
  },
};
