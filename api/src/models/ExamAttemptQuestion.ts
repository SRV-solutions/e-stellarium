import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export class ExamAttemptQuestion extends Model<
  InferAttributes<ExamAttemptQuestion>,
  InferCreationAttributes<ExamAttemptQuestion>
> {
  declare id: CreationOptional<string>;
  declare attemptId: string;
  declare questionId: string;
  declare position: number;
  declare shownAt: CreationOptional<Date | null>;
  declare deadlineAt: CreationOptional<Date | null>;
  declare answeredAt: CreationOptional<Date | null>;
  declare response: CreationOptional<object | null>;
  declare correct: CreationOptional<boolean | null>;
}

ExamAttemptQuestion.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    attemptId: { type: DataTypes.UUID, allowNull: false },
    questionId: { type: DataTypes.UUID, allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false },
    shownAt: { type: DataTypes.DATE, allowNull: true },
    deadlineAt: { type: DataTypes.DATE, allowNull: true },
    answeredAt: { type: DataTypes.DATE, allowNull: true },
    response: { type: DataTypes.JSONB, allowNull: true },
    correct: { type: DataTypes.BOOLEAN, allowNull: true },
  },
  { sequelize, tableName: "exam_attempt_questions", underscored: true, timestamps: false }
);
