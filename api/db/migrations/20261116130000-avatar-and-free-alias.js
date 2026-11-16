"use strict";

// Bloque 6a, perfil:
// - avatar: el dibujo elegido (una clave de lib/avatars.ts). Vacío = las iniciales.
// - alias_changed_at: cuándo cambió el alias por última vez (se puede una vez cada 30 días).
// - El alias deja de ser único: lo que identifica a una persona es el email. Los alias que se hacen
//   pasar por el staff los frena la lista de bloqueo (lib/alias.ts).
// down: vuelve a pedir alias únicos; falla si ya hay dos personas con el mismo (hay que cambiar uno antes).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn("users", "avatar", { type: Sequelize.STRING(20), allowNull: true }, { transaction });
      await queryInterface.addColumn("users", "alias_changed_at", { type: Sequelize.DATE, allowNull: true }, { transaction });
      await queryInterface.removeConstraint("users", "users_alias_key", { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addConstraint("users", { fields: ["alias"], type: "unique", name: "users_alias_key", transaction });
      await queryInterface.removeColumn("users", "alias_changed_at", { transaction });
      await queryInterface.removeColumn("users", "avatar", { transaction });
    });
  },
};
