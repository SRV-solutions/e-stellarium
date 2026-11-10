import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export class ChallengeAttempt extends Model<
  InferAttributes<ChallengeAttempt>,
  InferCreationAttributes<ChallengeAttempt>
> {
  declare id: CreationOptional<string>;
  declare challengeId: string;
  declare userId: string;
  declare startedAt: CreationOptional<Date | null>;
  declare finishedAt: CreationOptional<Date | null>;
  declare correctCount: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
}

ChallengeAttempt.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    challengeId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    finishedAt: { type: DataTypes.DATE, allowNull: true },
    correctCount: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "challenge_attempts", underscored: true, updatedAt: false }
);
