"use strict";

// El curso «SQL y Bases de Datos» de la web (clave sql), igual que los de seed-products.
const PRODUCT = {
  key: "sql",
  name: "SQL y Bases de Datos",
  drive_url: "https://drive.google.com/drive/folders/1HiJ2PYR-Bf3VXpPAyRtogEbHz9J_LyWU",
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("products", [PRODUCT]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("products", { key: PRODUCT.key });
  },
};
