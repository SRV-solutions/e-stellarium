import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

// El repaso de un alumno en un día. Se arma la primera vez que lo abre y queda guardado
export class DailyReview extends Model<InferAttributes<DailyReview>, InferCreationAttributes<DailyReview>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare day: string;
  declare createdAt: CreationOptional<Date>;
  declare finishedAt: CreationOptional<Date | null>;
}

DailyReview.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.UUID, allowNull: false },
    day: { type: DataTypes.DATEONLY, allowNull: false },
    createdAt: DataTypes.DATE,
    finishedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: "daily_reviews", underscored: true, updatedAt: false }
);
