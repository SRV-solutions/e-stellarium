import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from "sequelize";
import { sequelize } from "../db.js";

import type { Question } from "./Question.js";

// Una de las preguntas de un repaso
export class DailyReviewQuestion extends Model<
  InferAttributes<DailyReviewQuestion>,
  InferCreationAttributes<DailyReviewQuestion>
> {
  declare id: CreationOptional<string>;
  declare reviewId: string;
  declare questionId: string;
  declare position: number;
  declare correct: CreationOptional<boolean | null>; // vacío mientras no la respondió
  declare answeredAt: CreationOptional<Date | null>;

  declare Question?: NonAttribute<Question>;
}

DailyReviewQuestion.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    reviewId: { type: DataTypes.UUID, allowNull: false },
    questionId: { type: DataTypes.UUID, allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false },
    correct: { type: DataTypes.BOOLEAN, allowNull: true },
    answeredAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: "daily_review_questions", underscored: true, timestamps: false }
);
