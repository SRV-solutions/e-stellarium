"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("stars", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      constellation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "constellations", key: "id" },
        onDelete: "CASCADE",
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      kind: {
        type: Sequelize.ENUM("lesson", "exam"),
        allowNull: false,
        defaultValue: "lesson",
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

    await queryInterface.addConstraint("stars", {
      fields: ["constellation_id", "position"],
      type: "unique",
      name: "stars_constellation_position_unique",
    });

    await queryInterface.addIndex("stars", ["constellation_id"], {
      unique: true,
      where: { kind: "exam" },
      name: "stars_one_exam_per_constellation",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("stars");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_stars_kind";');
  },
};