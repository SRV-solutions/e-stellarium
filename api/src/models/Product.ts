import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export class Product extends Model<InferAttributes<Product>, InferCreationAttributes<Product>> {
  declare id: CreationOptional<string>;
  declare key: string;
  declare name: string;
  declare driveUrl: CreationOptional<string | null>;
  declare active: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Product.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    key: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    driveUrl: { type: DataTypes.STRING, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: "products", underscored: true }
);