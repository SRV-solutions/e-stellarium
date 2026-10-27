"use strict";

const folder = (id) => `https://drive.google.com/drive/folders/${id}`;

// Comentar a Marcos duplicación, desaparece con migración de AppScript a API.
const PRODUCTS = [
  { key: "scratch", name: "Scratch para Chicos", drive_url: null },
  { key: "scripting", name: "Curso de Scripting", drive_url: folder("1J8obsPj9OZZod4ZbIqNy-OKg8fuTb-cZ") },
  { key: "python", name: "Master en Python", drive_url: folder("10D1SoZwPVZEekeKhTWgHkJyx6Ia7bwBH") },
  { key: "fundamentos-backend", name: "Master en JavaScript", drive_url: folder("1F3sNy_CLXR_XNW62rFhV86Lp2Ht8E-1N") },
  { key: "backend-avanzado", name: "Backend Avanzado", drive_url: folder("14ML2UZ5BAkBB7-Uw1nLyPyO3mbqBCinP") },
  { key: "fullstack-csharp", name: "Curso Fullstack con C#", drive_url: folder("1eQPWcinDKEjpV7pYo6qfveT2Vbe7Q8xf") },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("products", PRODUCTS);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("products", {
      key: { [Sequelize.Op.in]: PRODUCTS.map((p) => p.key) },
    });
  },
};