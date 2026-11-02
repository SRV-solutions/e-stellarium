import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export type AnswerContext = "star" | "review" | "challenge" | "exam";

export class Answer extends Model<InferAttributes<Answer>, InferCreationAttributes<Answer>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare questionId: string;
  declare context: AnswerContext;
  declare correct: boolean;
  declare response: object;
  declare createdAt: CreationOptional<Date>;
}

Answer.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.UUID, allowNull: false },
    questionId: { type: DataTypes.UUID, allowNull: false },
    context: {
      type: DataTypes.ENUM("star", "review", "challenge", "exam"),
      allowNull: false,
    },
    correct: { type: DataTypes.BOOLEAN, allowNull: false },
    response: { type: DataTypes.JSONB, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "answers", underscored: true, updatedAt: false }
);