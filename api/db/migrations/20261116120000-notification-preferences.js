"use strict";

// Bloque 6a: las preferencias de cada persona, en users (la especificación pide "preferencias de mail
// y de notificación"). Las dos arrancan activadas y se cambian por separado:
// - notify_email: los mails que se pueden desactivar (el del desafío nuevo y el de banco bajo).
//   Los mails de cuenta (contraseña, cursos, cupones) y el de falla de integridad no dependen de esto.
// - notify_app: los avisos de la campanita.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const column = { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true };
      await queryInterface.addColumn("users", "notify_email", column, { transaction });
      await queryInterface.addColumn("users", "notify_app", column, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("users", "notify_app", { transaction });
      await queryInterface.removeColumn("users", "notify_email", { transaction });
    });
  },
};
