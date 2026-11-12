import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export type UserRole = "student" | "admin";

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare name: string;
  declare alias: string;
  declare passwordHash: CreationOptional<string | null>;
  declare role: CreationOptional<UserRole>;
  declare totalXp: CreationOptional<number>;
  declare streak: CreationOptional<number>;
  declare lastActiveOn: CreationOptional<string | null>; // "2026-11-10", en hora de Argentina
  declare streakFreezes: CreationOptional<number>;
  declare boughtFreezes: CreationOptional<number>; // los protectores comprados en la tienda
  declare glints: CreationOptional<number>; // el saldo de destellos
  // Los cosméticos puestos (ids del catálogo de games/cosmetics.ts). Vacío = ninguno, o el azul de siempre
  declare wornFrame: CreationOptional<string | null>;
  declare wornColor: CreationOptional<string | null>;
  declare wornTitle: CreationOptional<string | null>;
  declare titleVariant: CreationOptional<number>; // 0 o 1: "Cazadora" o "Cazador"
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    email: {
      type: DataTypes.STRING(254),
      allowNull: false,
      unique: true,
      set(value: string) {
        this.setDataValue("email", value.trim().toLowerCase());
      },
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    alias: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    role: {
      type: DataTypes.ENUM("student", "admin"),
      allowNull: false,
      defaultValue: "student",
    },
    totalXp: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    streak: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastActiveOn: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    streakFreezes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2,
    },
    boughtFreezes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    glints: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    wornFrame: { type: DataTypes.STRING(40), allowNull: true },
    wornColor: { type: DataTypes.STRING(40), allowNull: true },
    wornTitle: { type: DataTypes.STRING(40), allowNull: true },
    titleVariant: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "users",
    underscored: true,
    defaultScope: {
      attributes: { exclude: ["passwordHash"] },
    },
    scopes: {
      withPassword: {},
    },
  }
);