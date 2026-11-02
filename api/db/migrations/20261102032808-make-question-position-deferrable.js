"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE questions DROP CONSTRAINT questions_star_position_unique;
      ALTER TABLE questions ADD CONSTRAINT questions_star_position_unique
        UNIQUE (star_id, position) DEFERRABLE INITIALLY DEFERRED;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE questions DROP CONSTRAINT questions_star_position_unique;
      ALTER TABLE questions ADD CONSTRAINT questions_star_position_unique
        UNIQUE (star_id, position);
    `);
  },
};