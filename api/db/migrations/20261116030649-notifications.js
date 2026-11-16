"use strict";

// Bloque 5, paso 6: la campanita.
// - notifications: los avisos de cada persona. No es protegida (no es registro de nada: las leídas
//   se borran a los 90 días). `key` evita repetir un aviso que se crea al pedir la campanita
//   (desafío nuevo, cupón por vencer, racha en riesgo): única por persona.
// - challenge_bank_alerts: un curso y una dificultad con pocas preguntas de desafío. Mientras la fila
//   existe ya se avisó; cuando se reponen, se borra y puede volver a avisar.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "notifications",
        {
          id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onDelete: "CASCADE",
          },
          kind: { type: Sequelize.STRING(40), allowNull: false },
          title: { type: Sequelize.TEXT, allowNull: false },
          body: { type: Sequelize.TEXT, allowNull: false },
          link: { type: Sequelize.TEXT, allowNull: true },
          key: { type: Sequelize.STRING(120), allowNull: true },
          email_sent: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          created_at: { type: Sequelize.DATE, allowNull: false },
          read_at: { type: Sequelize.DATE, allowNull: true },
        },
        { transaction }
      );
      await queryInterface.addIndex("notifications", ["user_id", "key"], {
        name: "notifications_user_key",
        unique: true,
        transaction,
      });
      await queryInterface.addIndex("notifications", ["user_id", "created_at"], {
        name: "notifications_user_created",
        transaction,
      });

      await queryInterface.createTable(
        "challenge_bank_alerts",
        {
          product_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: "products", key: "id" },
            onDelete: "CASCADE",
          },
          difficulty: { type: Sequelize.STRING(10), allowNull: false, primaryKey: true },
          created_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction }
      );
      await queryInterface.sequelize.query(
        "ALTER TABLE challenge_bank_alerts ADD CONSTRAINT challenge_bank_alerts_difficulty CHECK (difficulty IN ('easy', 'medium', 'hard'))",
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("challenge_bank_alerts", { transaction });
      await queryInterface.dropTable("notifications", { transaction });
    });
  },
};
