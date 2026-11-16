"use strict";

// La demo para invitados: un cupón del 25 % a cambio del email, sin cuenta.
// - Un cupón de la demo no tiene dueño: coupons.user_id pasa a ser opcional y solo los de la demo van sin él.
//   (No se agrega ninguna columna a coupons: el dvh de cada fila se calcula con la fila entera, y una columna
//   nueva cambiaría el de todos los cupones que ya existen.)
// - demo_leads guarda el email normalizado (único) y el cupón que se le mandó, más la IP para el límite diario.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Un valor nuevo de un ENUM no se puede usar en la misma transacción en que se crea: va aparte
    await queryInterface.sequelize.query(`ALTER TYPE "enum_coupons_source" ADD VALUE IF NOT EXISTS 'demo'`);

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query("ALTER TABLE coupons ALTER COLUMN user_id DROP NOT NULL", { transaction });

      await queryInterface.removeConstraint("coupons", "coupons_source_matches", { transaction });
      await queryInterface.sequelize.query(
        `ALTER TABLE coupons ADD CONSTRAINT coupons_source_matches CHECK (
           (source = 'constellation' AND user_id IS NOT NULL AND constellation_id IS NOT NULL AND exam_attempt_id IS NOT NULL)
           OR (source IN ('shop', 'manual') AND user_id IS NOT NULL AND constellation_id IS NULL AND exam_attempt_id IS NULL)
           OR (source = 'demo' AND user_id IS NULL AND constellation_id IS NULL AND exam_attempt_id IS NULL)
         )`,
        { transaction }
      );

      await queryInterface.createTable(
        "demo_leads",
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal("gen_random_uuid()"),
          },
          email: { type: Sequelize.STRING(254), allowNull: false }, // normalizado: sin espacios ni mayúsculas
          coupon_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "coupons", key: "id" },
            onDelete: "RESTRICT",
          },
          ip: { type: Sequelize.STRING(45), allowNull: true }, // para el límite de cupones por IP
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
        },
        { transaction }
      );
      // Un cupón por email, y cada cupón de un solo email
      await queryInterface.addConstraint("demo_leads", {
        fields: ["email"],
        type: "unique",
        name: "demo_leads_email_unique",
        transaction,
      });
      await queryInterface.addConstraint("demo_leads", {
        fields: ["coupon_id"],
        type: "unique",
        name: "demo_leads_coupon_unique",
        transaction,
      });
      // Para contar los cupones que pidió una IP en el último día
      await queryInterface.addIndex("demo_leads", ["ip", "created_at"], { name: "demo_leads_ip_date", transaction });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("demo_leads", { transaction });
      await queryInterface.sequelize.query("DELETE FROM coupons WHERE source = 'demo'", { transaction });

      await queryInterface.removeConstraint("coupons", "coupons_source_matches", { transaction });
      await queryInterface.sequelize.query("ALTER TABLE coupons ALTER COLUMN user_id SET NOT NULL", { transaction });

      // Postgres no puede sacar un valor de un ENUM: se vuelve a crear el tipo sin 'demo'
      await queryInterface.sequelize.query("ALTER TABLE coupons ALTER COLUMN source TYPE text", { transaction });
      await queryInterface.sequelize.query('DROP TYPE "enum_coupons_source"', { transaction });
      await queryInterface.sequelize.query(`CREATE TYPE "enum_coupons_source" AS ENUM ('constellation', 'shop', 'manual')`, {
        transaction,
      });
      await queryInterface.sequelize.query(
        'ALTER TABLE coupons ALTER COLUMN source TYPE "enum_coupons_source" USING source::"enum_coupons_source"',
        { transaction }
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE coupons ADD CONSTRAINT coupons_source_matches CHECK (
           (source = 'constellation' AND constellation_id IS NOT NULL AND exam_attempt_id IS NOT NULL)
           OR (source <> 'constellation' AND constellation_id IS NULL AND exam_attempt_id IS NULL)
         )`,
        { transaction }
      );
    });
  },
};
