"use strict";

// La economía editable desde el panel (bloque 5):
// - settings: los números sueltos (XP y destellos de cada cosa, cupones del examen, protectores).
//   Una fila por valor; qué claves existen y su mínimo y máximo están en games/economy.ts.
// - shop_items: lo que se vende en la tienda (cupones, el protector y los cosméticos) y su precio.
// Las dos son tablas protegidas (dvh y el trigger de integridad). Las filas se crean con los valores
// que estaban en el código, sin dvh: después del deploy hay que sellarlas (npm run seal-integrity).

const SETTINGS = {
  "xp.question_correct": 10,
  "xp.star_completed": 50,
  "xp.exam_passed": 100,
  "xp.review_correct": 2,
  "xp.review_completed": 10,
  "xp.challenge_correct": 5,
  "xp.challenge_completed": 20,
  "glints.review_completed": 3,
  "glints.challenge_correct": 3,
  "glints.challenge_completed": 10,
  "glints.badge_7": 20,
  "glints.badge_30": 60,
  "glints.badge_100": 200,
  "streak.free_freezes": 2,
  "shop.freezes_per_month": 2,
  "coupon.first_percent": 60,
  "coupon.later_percent": 40,
  "coupon.valid_days": 60,
};

const ITEMS = [
  ["coupon_10", "coupon", "Cupón del 10 %", "", 150, { percent: 10 }],
  ["coupon_20", "coupon", "Cupón del 20 %", "", 350, { percent: 20 }],
  ["coupon_30", "coupon", "Cupón del 30 %", "", 700, { percent: 30 }],
  ["streak_freeze", "streak_freeze", "Protector de racha", "No vence", 60, {}],
  ["orbit", "frame", "Órbita", "Una luna que gira", 120, {}],
  ["eclipse", "frame", "Eclipse", "Corona de luz", 200, {}],
  ["rings", "frame", "Anillos", "Como Saturno", 300, {}],
  ["blue", "color", "Azul", "El de siempre", 0, { hex: "#4fa3ff" }],
  ["aurora", "color", "Aurora", "Verde polar", 150, { hex: "#3fe0a2" }],
  ["nebula", "color", "Nebulosa", "Violeta", 150, { hex: "#b9a6ff" }],
  ["corona", "color", "Corona solar", "Oro", 250, { hex: "#ffc94a" }],
  ["comet_hunter", "title", "Cazadora de cometas", "o Cazador", 100, { alt_name: "Cazador de cometas" }],
  ["navigator", "title", "Navegante", "", 100, {}],
  ["astronomer", "title", "Astrónoma de guardia", "o Astrónomo", 180, { alt_name: "Astrónomo de guardia" }],
];

const TABLES = ["settings", "shop_items"];
const ZERO = "0".repeat(64);

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const now = new Date();

      await queryInterface.createTable(
        "settings",
        {
          id: { type: Sequelize.STRING(40), primaryKey: true, allowNull: false }, // la clave: "xp.star_completed"
          value: { type: Sequelize.INTEGER, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
          dvh: { type: Sequelize.CHAR(64), allowNull: true },
        },
        { transaction }
      );
      // Ningún valor es negativo, y ningún cupón pasa del 60 %
      await queryInterface.sequelize.query(
        `ALTER TABLE settings
           ADD CONSTRAINT settings_value_not_negative CHECK (value >= 0),
           ADD CONSTRAINT settings_coupon_percent_cap CHECK (id NOT LIKE 'coupon.%percent' OR value BETWEEN 1 AND 60)`,
        { transaction }
      );
      await queryInterface.bulkInsert(
        "settings",
        Object.entries(SETTINGS).map(([id, value]) => ({ id, value, updated_at: now })),
        { transaction }
      );

      await queryInterface.createTable(
        "shop_items",
        {
          id: { type: Sequelize.STRING(40), primaryKey: true, allowNull: false }, // "coupon_10", "orbit"...
          kind: { type: Sequelize.ENUM("coupon", "streak_freeze", "frame", "color", "title"), allowNull: false },
          name: { type: Sequelize.STRING(60), allowNull: false },
          note: { type: Sequelize.STRING(80), allowNull: false, defaultValue: "" },
          price: { type: Sequelize.INTEGER, allowNull: false },
          percent: { type: Sequelize.SMALLINT, allowNull: true }, // solo los cupones
          hex: { type: Sequelize.STRING(7), allowNull: true }, // solo los colores
          alt_name: { type: Sequelize.STRING(60), allowNull: true }, // la otra forma de un título
          position: { type: Sequelize.SMALLINT, allowNull: false },
          active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true }, // false = retirado
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
          dvh: { type: Sequelize.CHAR(64), allowNull: true },
        },
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE shop_items
           ADD CONSTRAINT shop_items_price_not_negative CHECK (price >= 0),
           ADD CONSTRAINT shop_items_percent_only_coupons CHECK ((kind = 'coupon') = (percent IS NOT NULL)),
           ADD CONSTRAINT shop_items_percent_cap CHECK (percent IS NULL OR percent BETWEEN 1 AND 60),
           ADD CONSTRAINT shop_items_hex_only_colors CHECK ((kind = 'color') = (hex IS NOT NULL)),
           ADD CONSTRAINT shop_items_hex_valid CHECK (hex IS NULL OR hex ~ '^#[0-9a-f]{6}$'),
           ADD CONSTRAINT shop_items_alt_name_only_titles CHECK (alt_name IS NULL OR kind = 'title')`,
        { transaction }
      );
      // Un solo protector de racha
      await queryInterface.sequelize.query(
        "CREATE UNIQUE INDEX shop_items_one_freeze ON shop_items (kind) WHERE kind = 'streak_freeze'",
        { transaction }
      );
      await queryInterface.bulkInsert(
        "shop_items",
        ITEMS.map(([id, kind, name, note, price, extra], i) => ({
          id,
          kind,
          name,
          note,
          price,
          percent: extra.percent ?? null,
          hex: extra.hex ?? null,
          alt_name: extra.alt_name ?? null,
          position: i,
          active: true,
          created_at: now,
          updated_at: now,
        })),
        { transaction }
      );

      // Lo comprado tiene que existir en la tienda (los retirados siguen existiendo: no se borran)
      await queryInterface.addConstraint("user_cosmetics", {
        fields: ["cosmetic_id"],
        type: "foreign key",
        name: "user_cosmetics_cosmetic_fk",
        references: { table: "shop_items", field: "id" },
        onDelete: "RESTRICT",
        transaction,
      });

      // Tablas protegidas: el trigger anota lo que se escribe, para sellarlo antes del commit
      await queryInterface.bulkInsert(
        "integrity",
        TABLES.map((table_name) => ({ table_name, dvv: ZERO })),
        { transaction }
      );
      for (const table of TABLES) {
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
      await queryInterface.removeConstraint("user_cosmetics", "user_cosmetics_cosmetic_fk", { transaction });
      await queryInterface.bulkDelete("integrity", { table_name: TABLES }, { transaction });
      await queryInterface.bulkDelete("integrity_pending", { table_name: TABLES }, { transaction });
      await queryInterface.dropTable("shop_items", { transaction }); // se lleva sus triggers y restricciones
      await queryInterface.sequelize.query('DROP TYPE "enum_shop_items_kind"', { transaction });
      await queryInterface.dropTable("settings", { transaction });
    });
  },
};
