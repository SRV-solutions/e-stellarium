"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("coupons", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      code: {
        type: Sequelize.STRING(20),
        allowNull: false, // por ejemplo ESTL-PY-7K3Q
      },
      percent: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: true, // vacío = sin usar
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      constellation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "constellations", key: "id" },
        onDelete: "CASCADE",
      },
      exam_attempt_id: {
        type: Sequelize.UUID,
        allowNull: false, // el intento aprobado que lo dio
        references: { model: "exam_attempts", key: "id" },
        onDelete: "CASCADE",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
    });

    await queryInterface.addConstraint("coupons", {
      fields: ["code"],
      type: "unique",
      name: "coupons_code_unique",
    });

    // Un cupón por constelación para cada alumno
    await queryInterface.addConstraint("coupons", {
      fields: ["user_id", "constellation_id"],
      type: "unique",
      name: "coupons_user_constellation_unique",
    });

    await queryInterface.addConstraint("coupons", {
      fields: ["exam_attempt_id"],
      type: "unique",
      name: "coupons_exam_attempt_unique",
    });

    await queryInterface.addConstraint("coupons", {
      fields: ["percent"],
      type: "check",
      where: { percent: { [Sequelize.Op.between]: [1, 100] } },
      name: "coupons_percent_range",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("coupons");
  },
};
