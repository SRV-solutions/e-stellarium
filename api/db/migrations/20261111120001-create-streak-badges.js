"use strict";

// Las insignias de racha que ganó cada alumno. Quedan para siempre, aunque la racha se corte
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "streak_badges",
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
          days: {
            type: Sequelize.INTEGER,
            allowNull: false, // 7, 30 o 100 días de racha
          },
          earned_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("now()"),
          },
        },
        { transaction }
      );

      await queryInterface.addConstraint("streak_badges", {
        fields: ["user_id", "days"],
        type: "unique",
        name: "streak_badges_once_per_user",
        transaction,
      });
      await queryInterface.addConstraint("streak_badges", {
        fields: ["days"],
        type: "check",
        where: { days: [7, 30, 100] },
        name: "streak_badges_days_valid",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("streak_badges");
  },
};
