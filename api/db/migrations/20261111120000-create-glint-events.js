"use strict";

// Los destellos: los movimientos (ganados con signo +, gastados con signo -) y el saldo en users
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "glint_events",
        {
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
          amount: {
            type: Sequelize.INTEGER,
            allowNull: false, // positivo si los ganó, negativo si los gastó
          },
          reason: {
            type: Sequelize.STRING(40),
            allowNull: false, // por ejemplo "challenge_correct" o "streak_badge"
          },
          reference_id: {
            type: Sequelize.UUID,
            allowNull: false, // lo que dio (o costó) los destellos: la pregunta del desafío, el repaso...
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("now()"),
          },
        },
        { transaction }
      );

      await queryInterface.addConstraint("glint_events", {
        fields: ["user_id", "reason", "reference_id"],
        type: "unique",
        name: "glint_events_once_per_reason",
        transaction,
      });
      await queryInterface.addConstraint("glint_events", {
        fields: ["amount"],
        type: "check",
        where: { amount: { [Sequelize.Op.ne]: 0 } },
        name: "glint_events_amount_not_zero",
        transaction,
      });

      await queryInterface.addColumn(
        "users",
        "glints",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }, // el saldo
        { transaction }
      );
      await queryInterface.addConstraint("users", {
        fields: ["glints"],
        type: "check",
        where: { glints: { [Sequelize.Op.gte]: 0 } },
        name: "users_glints_not_negative",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Al borrar la columna se borra también su restricción
      await queryInterface.removeColumn("users", "glints", { transaction });
      await queryInterface.dropTable("glint_events", { transaction });
    });
  },
};
