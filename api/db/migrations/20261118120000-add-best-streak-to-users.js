"use strict";

// Ranking de rachas: users.best_streak es la racha más larga que tuvo cada alumno (vigente o no).
// Se actualiza en recordActivity (games/activity.ts). Para los que ya jugaron se rellena con la corrida
// más larga de días seguidos de daily_activity (no cuenta los protectores, así que puede quedar un
// poco por debajo de la real) y, si es mayor, con la racha de hoy.
// Mientras rellena, el trigger de integridad no anota nada: después del deploy hay que correr
// `npm run seal-integrity` (la columna nueva cambia el to_jsonb de todos los usuarios).
// down: saca la columna.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "users",
        "best_streak",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction }
      );
      await queryInterface.sequelize.query("SELECT set_config('integrity.sealing', 'on', true)", { transaction });
      await queryInterface.sequelize.query(
        `WITH runs AS (
           SELECT user_id, count(*)::int AS len
             FROM (SELECT user_id, day, day - (row_number() OVER (PARTITION BY user_id ORDER BY day))::int AS grp
                     FROM daily_activity) d
            GROUP BY user_id, grp
         ), best AS (
           SELECT user_id, max(len) AS len FROM runs GROUP BY user_id
         )
         UPDATE users u SET best_streak = GREATEST(
                  u.streak,
                  COALESCE((SELECT b.len FROM best b WHERE b.user_id = u.id), 0),
                  -- una insignia ganada prueba que llegó a esos días (los protectores no se ven en daily_activity)
                  COALESCE((SELECT max(sb.days) FROM streak_badges sb WHERE sb.user_id = u.id), 0))`,
        { transaction }
      );
      await queryInterface.addConstraint("users", {
        fields: ["best_streak"],
        type: "check",
        where: { best_streak: { [Sequelize.Op.gte]: 0 } },
        name: "users_best_streak_not_negative",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeConstraint("users", "users_best_streak_not_negative", { transaction });
      await queryInterface.removeColumn("users", "best_streak", { transaction });
    });
  },
};
