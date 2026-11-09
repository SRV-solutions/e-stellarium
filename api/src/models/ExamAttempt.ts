import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export class ExamAttempt extends Model<
  InferAttributes<ExamAttempt>,
  InferCreationAttributes<ExamAttempt>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare starId: string;
  declare number: number;
  declare startedAt: CreationOptional<Date>;
  declare finishedAt: CreationOptional<Date | null>;
  declare correctCount: CreationOptional<number | null>;
  declare passed: CreationOptional<boolean | null>;
}

ExamAttempt.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.UUID, allowNull: false },
    starId: { type: DataTypes.UUID, allowNull: false },
    number: { type: DataTypes.INTEGER, allowNull: false },
    startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    finishedAt: { type: DataTypes.DATE, allowNull: true },
    correctCount: { type: DataTypes.INTEGER, allowNull: true },
    passed: { type: DataTypes.BOOLEAN, allowNull: true },
  },
  { sequelize, tableName: "exam_attempts", underscored: true, timestamps: false }
);
