import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

// Una insignia de racha ganada (7, 30 o 100 días). Queda para siempre
export class StreakBadge extends Model<InferAttributes<StreakBadge>, InferCreationAttributes<StreakBadge>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare days: number;
  declare earnedAt: CreationOptional<Date>;
}

StreakBadge.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.UUID, allowNull: false },
    days: { type: DataTypes.INTEGER, allowNull: false },
    earnedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: "streak_badges", underscored: true, timestamps: false }
);
