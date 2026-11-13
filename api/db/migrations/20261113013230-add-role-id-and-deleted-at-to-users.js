"use strict";

// users.role (el ENUM student/admin) pasa a ser role_id, una clave foránea a roles.
// Los que eran admin quedan admin; los super admin se ponen con `npm run set-role`.
// deleted_at es la baja lógica: con fecha, el usuario no puede entrar y no aparece en el ranking.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "users",
        "role_id",
        {
          type: Sequelize.SMALLINT,
          allowNull: false,
          defaultValue: 1, // student
          references: { model: "roles", key: "id" },
          onDelete: "RESTRICT",
        },
        { transaction }
      );
      await queryInterface.sequelize.query(
        "UPDATE users SET role_id = (SELECT id FROM roles WHERE key = users.role::text)",
        { transaction }
      );
      await queryInterface.removeColumn("users", "role", { transaction });
      await queryInterface.sequelize.query('DROP TYPE "enum_users_role"', { transaction });

      await queryInterface.addColumn(
        "users",
        "deleted_at",
        { type: Sequelize.DATE, allowNull: true },
        { transaction }
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("users", "deleted_at", { transaction });
      await queryInterface.addColumn(
        "users",
        "role",
        { type: Sequelize.ENUM("student", "admin"), allowNull: false, defaultValue: "student" },
        { transaction }
      );
      // El viejo ENUM no tiene docente ni super admin: los docentes vuelven a alumno y los super admin a admin
      await queryInterface.sequelize.query(
        `UPDATE users SET role = CASE WHEN role_id IN (3, 4) THEN 'admin' ELSE 'student' END::enum_users_role`,
        { transaction }
      );
      await queryInterface.removeColumn("users", "role_id", { transaction });
    });
  },
};
