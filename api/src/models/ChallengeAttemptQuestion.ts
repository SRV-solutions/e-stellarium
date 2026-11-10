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

// own: de sus cursos; explore y discover: de cursos que no tiene
export type ChallengePart = "own" | "explore" | "discover";

export class ChallengeAttemptQuestion extends Model<
  InferAttributes<ChallengeAttemptQuestion>,
  InferCreationAttributes<ChallengeAttemptQuestion>
> {
  declare id: CreationOptional<string>;
  declare attemptId: string;
  declare questionId: string;
  declare position: number;
  declare part: ChallengePart;
  declare shownAt: CreationOptional<Date | null>;
  declare deadlineAt: CreationOptional<Date | null>;
  declare answeredAt: CreationOptional<Date | null>;
  declare response: CreationOptional<object | null>;
  declare correct: CreationOptional<boolean | null>;
  declare Question?: NonAttribute<Question>;
}

ChallengeAttemptQuestion.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    attemptId: { type: DataTypes.UUID, allowNull: false },
    questionId: { type: DataTypes.UUID, allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false },
    part: { type: DataTypes.ENUM("own", "explore", "discover"), allowNull: false },
    shownAt: { type: DataTypes.DATE, allowNull: true },
    deadlineAt: { type: DataTypes.DATE, allowNull: true },
    answeredAt: { type: DataTypes.DATE, allowNull: true },
    response: { type: DataTypes.JSONB, allowNull: true },
    correct: { type: DataTypes.BOOLEAN, allowNull: true },
  },
  { sequelize, tableName: "challenge_attempt_questions", underscored: true, timestamps: false }
);
