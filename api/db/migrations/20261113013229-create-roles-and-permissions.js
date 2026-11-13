"use strict";

// Roles y permisos en la base. Los permisos que existen son los de src/lib/permissions.ts (un test
// verifica que coincidan); lo editable desde el panel es qué rol tiene cuál (role_permissions).
// El super admin no tiene filas: can() le da todo siempre, y su rol no se edita.

const ROLES = [
  { id: 1, key: "student", name: "Estudiante" },
  { id: 2, key: "teacher", name: "Docente" },
  { id: 3, key: "admin", name: "Admin" },
  { id: 4, key: "super_admin", name: "Super admin" },
];

const PERMISSIONS = [
  { key: "content:edit", description: "Crear y editar juegos y preguntas" },
  { key: "content:approve", description: "Aprobar, rechazar o despublicar contenido" },
  { key: "students:view", description: "Ver el progreso de los alumnos" },
  { key: "challenges:manage", description: "Configurar desafíos, receta y cola" },
  { key: "economy:edit", description: "Editar la economía y la tienda" },
  { key: "users:manage", description: "Altas manuales, asignar y revocar cursos, reenviar links" },
  { key: "coupons:manage", description: "Emitir y anular cupones" },
  { key: "audit:view", description: "Ver la bitácora completa" },
  { key: "audit:revert", description: "Revertir acciones desde la bitácora" },
  { key: "integrity:view", description: "Ver y correr la verificación de integridad" },
  { key: "roles:manage", description: "Cambiar roles, editar permisos y dar de baja usuarios" },
];

// La matriz inicial de la especificación (sin el super admin)
const MATRIX = {
  2: ["content:edit", "students:view"],
  3: [
    "content:edit",
    "content:approve",
    "students:view",
    "challenges:manage",
    "economy:edit",
    "users:manage",
    "coupons:manage",
  ],
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "roles",
        {
          id: { type: Sequelize.SMALLINT, primaryKey: true, allowNull: false },
          key: { type: Sequelize.STRING(30), allowNull: false, unique: true },
          name: { type: Sequelize.STRING(60), allowNull: false },
        },
        { transaction }
      );

      await queryInterface.createTable(
        "permissions",
        {
          key: { type: Sequelize.STRING(40), primaryKey: true, allowNull: false },
          description: { type: Sequelize.STRING(120), allowNull: false },
        },
        { transaction }
      );

      await queryInterface.createTable(
        "role_permissions",
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal("gen_random_uuid()"),
          },
          role_id: {
            type: Sequelize.SMALLINT,
            allowNull: false,
            references: { model: "roles", key: "id" },
            onDelete: "RESTRICT",
          },
          permission_key: {
            type: Sequelize.STRING(40),
            allowNull: false,
            references: { model: "permissions", key: "key" },
            onDelete: "RESTRICT",
            onUpdate: "CASCADE",
          },
        },
        { transaction }
      );
      await queryInterface.addConstraint("role_permissions", {
        fields: ["role_id", "permission_key"],
        type: "unique",
        name: "role_permissions_role_permission_unique",
        transaction,
      });

      await queryInterface.bulkInsert("roles", ROLES, { transaction });
      await queryInterface.bulkInsert("permissions", PERMISSIONS, { transaction });
      const rows = Object.entries(MATRIX).flatMap(([roleId, keys]) =>
        keys.map((key) => ({ role_id: Number(roleId), permission_key: key }))
      );
      await queryInterface.bulkInsert("role_permissions", rows, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("role_permissions", { transaction });
      await queryInterface.dropTable("permissions", { transaction });
      await queryInterface.dropTable("roles", { transaction });
    });
  },
};
