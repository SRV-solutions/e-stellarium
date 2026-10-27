"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("enrollments", {
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
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "products", key: "id" },
        onDelete: "RESTRICT",
      },
      payment_id: {
        type: Sequelize.STRING(30),
        allowNull: true, // nulo en las altas manuales del staff
      },
      status: {
        type: Sequelize.ENUM("active", "revoked"),
        allowNull: false,
        defaultValue: "active",
      },
      purchased_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
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

    await queryInterface.addConstraint("enrollments", {
      fields: ["user_id", "product_id"],
      type: "unique",
      name: "enrollments_user_product_unique",
    });
    await queryInterface.addIndex("enrollments", ["payment_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("enrollments");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_enrollments_status";');
  },
};