"use strict";

// Los cosméticos: los que compró cada alumno (user_cosmetics) y los que lleva puestos (columnas en users).
// El catálogo (nombres y precios) está en el código, en games/cosmetics.ts.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "user_cosmetics",
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
          cosmetic_id: {
            type: Sequelize.STRING(40),
            allowNull: false, // por ejemplo "orbit" o "aurora"
          },
          purchased_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("now()"),
          },
        },
        { transaction }
      );
      await queryInterface.addConstraint("user_cosmetics", {
        fields: ["user_id", "cosmetic_id"],
        type: "unique",
        name: "user_cosmetics_once_per_user",
        transaction,
      });

      // Lo que lleva puesto. Vacío = nada (o el azul de siempre, en el color del trazo)
      const column = { type: Sequelize.STRING(40), allowNull: true };
      await queryInterface.addColumn("users", "worn_frame", column, { transaction });
      await queryInterface.addColumn("users", "worn_color", column, { transaction });
      await queryInterface.addColumn("users", "worn_title", column, { transaction });
      await queryInterface.addColumn(
        "users",
        "title_variant",
        { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 0 }, // 0 o 1: "Cazadora" o "Cazador"
        { transaction }
      );
      await queryInterface.addConstraint("users", {
        fields: ["title_variant"],
        type: "check",
        where: { title_variant: [0, 1] },
        name: "users_title_variant_valid",
        transaction,
      });

      // Solo se puede llevar puesto lo que compró: cada columna apunta a una fila suya de user_cosmetics
      for (const kind of ["frame", "color", "title"]) {
        await queryInterface.sequelize.query(
          `ALTER TABLE users ADD CONSTRAINT users_worn_${kind}_owned
             FOREIGN KEY (id, worn_${kind}) REFERENCES user_cosmetics (user_id, cosmetic_id)`,
          { transaction }
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Al borrar las columnas se borran también sus restricciones
      await queryInterface.removeColumn("users", "title_variant", { transaction });
      await queryInterface.removeColumn("users", "worn_title", { transaction });
      await queryInterface.removeColumn("users", "worn_color", { transaction });
      await queryInterface.removeColumn("users", "worn_frame", { transaction });
      await queryInterface.dropTable("user_cosmetics", { transaction });
    });
  },
};
