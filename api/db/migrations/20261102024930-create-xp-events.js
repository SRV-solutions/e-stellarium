"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("xp_events", {
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
      xp: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      reason: {
        type: Sequelize.STRING(40),
        allowNull: false, // por ejemplo "question_correct" o "star_completed"
      },
      reference_id: {
        type: Sequelize.UUID,
        allowNull: false, // la pregunta o la estrella que dio la experiencia
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
    });

    await queryInterface.addConstraint("xp_events", {
      fields: ["user_id", "reason", "reference_id"],
      type: "unique",
      name: "xp_events_once_per_reason",
    });

    await queryInterface.addIndex("xp_events", ["created_at"], {
      name: "xp_events_date",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("xp_events");
  },
};