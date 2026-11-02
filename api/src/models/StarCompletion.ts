import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export class StarCompletion extends Model<
  InferAttributes<StarCompletion>,
  InferCreationAttributes<StarCompletion>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare starId: string;
  declare createdAt: CreationOptional<Date>;
}

StarCompletion.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.UUID, allowNull: false },
    starId: { type: DataTypes.UUID, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "star_completions", underscored: true, updatedAt: false }
);