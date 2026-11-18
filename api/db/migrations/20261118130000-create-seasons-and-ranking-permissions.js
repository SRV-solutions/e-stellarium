"use strict";

// Las temporadas del ranking y sus permisos.
// - seasons: una fila por temporada. Hay una sola abierta (ended_at vacío): el índice único parcial lo obliga.
//   Cerrar una temporada no borra nada: solo es una fecha de corte para las tablas de experiencia, estrellas,
//   desafíos y destellos. La primera arranca el 1 de enero de 2026 (00:00 de Argentina): antes no había datos,
//   así que al desplegar el ranking de los alumnos queda igual.
// - season_snapshots: la foto del top 10 de cada tabla al cerrar (el historial).
// - Permisos ranking:view y ranking:award para el rol admin (3). ranking:reset (cerrar temporada) no se le da
//   a nadie: el super admin tiene todo por código.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "seasons",
        {
          id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal("gen_random_uuid()") },
          name: { type: Sequelize.STRING(60), allowNull: false },
          started_at: { type: Sequelize.DATE, allowNull: false },
          ended_at: { type: Sequelize.DATE, allowNull: true },
          closed_by: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onDelete: "SET NULL" },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
        },
        { transaction }
      );
      await queryInterface.addConstraint("seasons", {
        fields: ["ended_at"],
        type: "check",
        where: Sequelize.literal("ended_at IS NULL OR ended_at > started_at"),
        name: "seasons_ends_after_start",
        transaction,
      });
      // Una sola temporada abierta
      await queryInterface.sequelize.query(
        "CREATE UNIQUE INDEX seasons_one_open ON seasons ((true)) WHERE ended_at IS NULL",
        { transaction }
      );
      await queryInterface.bulkInsert(
        "seasons",
        [{ name: "Temporada 1", started_at: new Date("2026-01-01T03:00:00Z"), created_at: new Date() }],
        { transaction }
      );

      await queryInterface.createTable(
        "season_snapshots",
        {
          id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal("gen_random_uuid()") },
          season_id: { type: Sequelize.UUID, allowNull: false, references: { model: "seasons", key: "id" }, onDelete: "CASCADE" },
          board: { type: Sequelize.STRING(20), allowNull: false },
          position: { type: Sequelize.INTEGER, allowNull: false },
          // Si después se da de baja del todo a la persona, la foto queda con su alias y nombre de ese momento
          user_id: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onDelete: "SET NULL" },
          alias: { type: Sequelize.STRING(40), allowNull: false },
          name: { type: Sequelize.STRING, allowNull: false },
          value: { type: Sequelize.INTEGER, allowNull: false },
        },
        { transaction }
      );
      await queryInterface.addConstraint("season_snapshots", {
        fields: ["season_id", "board", "position"],
        type: "unique",
        name: "season_snapshots_unique_position",
        transaction,
      });

      await queryInterface.bulkInsert("permissions", [
        { key: "ranking:view", description: "Ver el ranking con nombres y emails" },
        { key: "ranking:award", description: "Premiar a jugadores del ranking con destellos o cupones" },
        { key: "ranking:reset", description: "Cerrar la temporada del ranking" },
      ], {
        transaction,
      });
      await queryInterface.bulkInsert(
        "role_permissions",
        [
          { role_id: 3, permission_key: "ranking:view" },
          { role_id: 3, permission_key: "ranking:award" },
        ],
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        "DELETE FROM role_permissions WHERE permission_key IN ('ranking:view', 'ranking:award', 'ranking:reset')",
        { transaction }
      );
      await queryInterface.sequelize.query(
        "DELETE FROM permissions WHERE key IN ('ranking:view', 'ranking:award', 'ranking:reset')",
        { transaction }
      );
      await queryInterface.dropTable("season_snapshots", { transaction });
      await queryInterface.dropTable("seasons", { transaction });
    });
  },
};
