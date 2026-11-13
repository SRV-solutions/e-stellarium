"use strict";

// La bitácora del staff. Solo se agregan registros: un trigger rechaza cualquier UPDATE o DELETE.
// Por eso "revertido" no es una columna del registro original: se deduce del registro que lo
// revierte (reverts_id, única, así cada registro se revierte una sola vez).
// hash = HMAC-SHA256 de los campos más prev_hash (lo calcula la API, ver lib/audit.ts).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "audit_logs",
        {
          id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
          created_at: { type: Sequelize.DATE, allowNull: false },
          actor_id: {
            type: Sequelize.UUID,
            allowNull: true, // vacío: un script o la verificación diaria
            references: { model: "users", key: "id" },
            onDelete: "RESTRICT",
          },
          ip: { type: Sequelize.STRING(45), allowNull: true },
          action: { type: Sequelize.STRING(60), allowNull: false },
          target_type: { type: Sequelize.STRING(40), allowNull: true },
          target_id: { type: Sequelize.STRING(64), allowNull: true },
          before: { type: Sequelize.JSONB, allowNull: true },
          after: { type: Sequelize.JSONB, allowNull: true },
          reversible: { type: Sequelize.BOOLEAN, allowNull: false },
          reverts_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            unique: true,
            references: { model: "audit_logs", key: "id" },
            onDelete: "RESTRICT",
          },
          prev_hash: { type: Sequelize.CHAR(64), allowNull: true }, // vacío solo en el primero
          hash: { type: Sequelize.CHAR(64), allowNull: false },
        },
        { transaction }
      );
      await queryInterface.addIndex("audit_logs", ["actor_id"], { transaction });
      await queryInterface.addIndex("audit_logs", ["target_type", "target_id"], { transaction });

      await queryInterface.sequelize.query(
        `CREATE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
         BEGIN
           RAISE EXCEPTION 'La bitácora no se edita ni se borra';
         END;
         $$ LANGUAGE plpgsql;

         CREATE TRIGGER audit_logs_append_only
           BEFORE UPDATE OR DELETE ON audit_logs
           FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("audit_logs", { transaction }); // se lleva el trigger
      await queryInterface.sequelize.query("DROP FUNCTION audit_logs_append_only()", { transaction });
    });
  },
};
