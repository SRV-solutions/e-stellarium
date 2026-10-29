import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from "sequelize";
import { sequelize } from "../db.js";
import type { Constellation } from "./Constellation.js";

export type StarKind = "lesson" | "exam";

export class Star extends Model<InferAttributes<Star>, InferCreationAttributes<Star>> {
  declare id: CreationOptional<string>;
  declare constellationId: string;
  declare position: number;
  declare title: string;
  declare description: CreationOptional<string | null>;
  declare kind: CreationOptional<StarKind>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare Constellation?: NonAttribute<Constellation>;
}

Star.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    constellationId: { type: DataTypes.UUID, allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    kind: { type: DataTypes.ENUM("lesson", "exam"), allowNull: false, defaultValue: "lesson" },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: "stars", underscored: true }
);