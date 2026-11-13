"use strict";

// Dígitos verificadores (ver lib/integrity.ts):
// - dvh en cada fila de las tablas protegidas: HMAC de la fila (la calcula la API, con la clave secreta).
// - integrity: el DVV de cada tabla protegida (y el de la bitácora).
// - integrity_pending: un trigger anota cada fila que se escribe; antes del commit, la API la sella.
// - integrity_checks: el resultado de cada verificación.

const PROTECTED = ["users", "coupons", "xp_events", "roles", "role_permissions"];
const ZERO = "0".repeat(64);

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of PROTECTED) {
        await queryInterface.addColumn(table, "dvh", { type: Sequelize.CHAR(64), allowNull: true }, { transaction });
      }

      await queryInterface.createTable(
        "integrity",
        {
          table_name: { type: Sequelize.STRING(40), primaryKey: true, allowNull: false },
          dvv: { type: Sequelize.CHAR(64), allowNull: false },
        },
        { transaction }
      );
      await queryInterface.bulkInsert(
        "integrity",
        [...PROTECTED, "audit_logs"].map((table_name) => ({ table_name, dvv: ZERO })),
        { transaction }
      );

      await queryInterface.createTable(
        "integrity_pending",
        {
          id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
          xid: { type: "xid8", allowNull: false, defaultValue: Sequelize.literal("pg_current_xact_id()") },
          table_name: { type: Sequelize.STRING(40), allowNull: false },
          row_id: { type: Sequelize.STRING(64), allowNull: false },
          old_dvh: { type: Sequelize.CHAR(64), allowNull: true },
          old_data: { type: Sequelize.JSONB, allowNull: true }, // vacío: la fila es nueva
        },
        { transaction }
      );
      await queryInterface.addIndex("integrity_pending", ["xid"], { transaction });

      await queryInterface.createTable(
        "integrity_checks",
        {
          id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
          checked_at: { type: Sequelize.DATE, allowNull: false },
          source: { type: Sequelize.ENUM("manual", "daily"), allowNull: false },
          daily_day: { type: Sequelize.DATEONLY, allowNull: true, unique: true }, // una diaria por día
          ok: { type: Sequelize.BOOLEAN, allowNull: false },
          problem_count: { type: Sequelize.INTEGER, allowNull: false },
          problems: { type: Sequelize.JSONB, allowNull: false }, // los primeros 100
          checked_by: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "users", key: "id" },
            onDelete: "RESTRICT",
          },
        },
        { transaction }
      );

      // El trigger anota la fila escrita (y cómo era antes). Mientras la API sella, no anota nada.
      await queryInterface.sequelize.query(
        `CREATE FUNCTION integrity_track() RETURNS trigger AS $$
         BEGIN
           IF current_setting('integrity.sealing', true) = 'on' THEN
             RETURN NULL;
           END IF;
           IF TG_OP = 'INSERT' THEN
             INSERT INTO integrity_pending (table_name, row_id) VALUES (TG_TABLE_NAME, NEW.id::text);
           ELSE
             INSERT INTO integrity_pending (table_name, row_id, old_dvh, old_data)
             VALUES (TG_TABLE_NAME, OLD.id::text, OLD.dvh, to_jsonb(OLD) - 'dvh');
           END IF;
           RETURN NULL;
         END;
         $$ LANGUAGE plpgsql;`,
        { transaction }
      );
      for (const table of PROTECTED) {
        await queryInterface.sequelize.query(
          `CREATE TRIGGER ${table}_integrity AFTER INSERT OR UPDATE OR DELETE ON ${table}
             FOR EACH ROW EXECUTE FUNCTION integrity_track();`,
          { transaction }
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of PROTECTED) {
        await queryInterface.sequelize.query(`DROP TRIGGER ${table}_integrity ON ${table}`, { transaction });
        await queryInterface.removeColumn(table, "dvh", { transaction });
      }
      await queryInterface.sequelize.query("DROP FUNCTION integrity_track()", { transaction });
      await queryInterface.dropTable("integrity_checks", { transaction });
      await queryInterface.sequelize.query('DROP TYPE "enum_integrity_checks_source"', { transaction });
      await queryInterface.dropTable("integrity_pending", { transaction });
      await queryInterface.dropTable("integrity", { transaction });
    });
  },
};
