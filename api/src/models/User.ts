import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare name: string;
  declare alias: string; // se puede repetir: lo que identifica a una persona es el email
  declare avatar: CreationOptional<string | null>; // el dibujo elegido (lib/avatars.ts); vacío = las iniciales
  declare aliasChangedAt: CreationOptional<Date | null>;
  declare passwordHash: CreationOptional<string | null>;
  declare roleId: CreationOptional<number>; // ver roles: 1 es student
  declare totalXp: CreationOptional<number>;
  declare streak: CreationOptional<number>;
  declare bestStreak: CreationOptional<number>; // la racha más larga que tuvo, vigente o no
  declare lastActiveOn: CreationOptional<string | null>; // "2026-11-10", en hora de Argentina
  declare streakFreezes: CreationOptional<number>;
  declare boughtFreezes: CreationOptional<number>; // los protectores comprados en la tienda
  declare glints: CreationOptional<number>; // el saldo de destellos
  // Los cosméticos puestos (ids del catálogo de games/cosmetics.ts). Vacío = ninguno, o el azul de siempre
  declare wornFrame: CreationOptional<string | null>;
  declare wornColor: CreationOptional<string | null>;
  declare wornTitle: CreationOptional<string | null>;
  declare titleVariant: CreationOptional<number>; // 0 o 1: "Cazadora" o "Cazador"
  // Preferencias: los mails que se pueden desactivar (desafío nuevo, banco bajo) y los avisos de la campanita
  declare notifyEmail: CreationOptional<boolean>;
  declare notifyApp: CreationOptional<boolean>;
  declare deletedAt: CreationOptional<Date | null>; // la baja lógica: con fecha, no puede entrar
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
    },
    avatar: { type: DataTypes.STRING(20), allowNull: true },
    aliasChangedAt: { type: DataTypes.DATE, allowNull: true },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    roleId: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 1,
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
    bestStreak: {
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
    notifyEmail: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    notifyApp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    deletedAt: { type: DataTypes.DATE, allowNull: true },
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