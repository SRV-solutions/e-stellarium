"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE FUNCTION check_question_star_product() RETURNS trigger AS $$
      BEGIN
        IF NEW.star_id IS NOT NULL AND NOT EXISTS (
          SELECT 1
          FROM stars s
          JOIN constellations c ON c.id = s.constellation_id
          WHERE s.id = NEW.star_id AND c.product_id = NEW.product_id
        ) THEN
          RAISE EXCEPTION 'questions_star_product_match: la pregunta y su estrella son de cursos distintos'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryInterface.sequelize.query(`
      CREATE TRIGGER questions_star_product_match
      BEFORE INSERT OR UPDATE OF star_id, product_id ON questions
      FOR EACH ROW EXECUTE FUNCTION check_question_star_product();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TRIGGER IF EXISTS questions_star_product_match ON questions;");
    await queryInterface.sequelize.query("DROP FUNCTION IF EXISTS check_question_star_product();");
  },
};