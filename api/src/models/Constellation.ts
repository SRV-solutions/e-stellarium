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

export class Constellation extends Model<
  InferAttributes<Constellation>,
  InferCreationAttributes<Constellation>
> {
  declare id: CreationOptional<string>;
  declare productId: string;
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare published: CreationOptional<boolean>;
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
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: "constellations", underscored: true }
);