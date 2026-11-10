import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

// Un día en que el alumno jugó algo. De acá sale la racha
export class DailyActivity extends Model<InferAttributes<DailyActivity>, InferCreationAttributes<DailyActivity>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare day: string; // "2026-11-10", en hora de Argentina
  declare createdAt: CreationOptional<Date>;
}

DailyActivity.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.UUID, allowNull: false },
    day: { type: DataTypes.DATEONLY, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "daily_activity", underscored: true, updatedAt: false }
);
