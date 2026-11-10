import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from "sequelize";
import { sequelize } from "../db.js";
import type { Product } from "./Product.js";
import type { Star } from "./Star.js";

// Un módulo del curso, como en la guía de estudio
export type CourseModule = { number: number; title: string; classes: string };

export class Constellation extends Model<
  InferAttributes<Constellation>,
  InferCreationAttributes<Constellation>
> {
  declare id: CreationOptional<string>;
  declare productId: string;
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare published: CreationOptional<boolean>;
  declare modules: CreationOptional<CourseModule[]>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare Product?: NonAttribute<Product>;
  declare Stars?: NonAttribute<Star[]>;
}

Constellation.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    productId: { type: DataTypes.UUID, allowNull: false, unique: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    modules: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: "constellations", underscored: true }
);