import { Sequelize } from "sequelize";

if (!process.env.DATABASE_URL) {
  throw new Error("Falta DATABASE_URL en las variables de entorno");
}

export const sequelize: Sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: process.env.DB_LOGGING === "true" ? console.log : false,
});