import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export type ChallengeKind = "auto" | "manual";

export class Challenge extends Model<InferAttributes<Challenge>, InferCreationAttributes<Challenge>> {
  declare id: CreationOptional<string>;
  declare publishedAt: Date;
  declare closesAt: Date;
  declare kind: CreationOptional<ChallengeKind>;
  declare createdAt: CreationOptional<Date>;
}

Challenge.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    publishedAt: { type: DataTypes.DATE, allowNull: false, unique: true },
    closesAt: { type: DataTypes.DATE, allowNull: false },
    kind: { type: DataTypes.ENUM("auto", "manual"), allowNull: false, defaultValue: "auto" },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "challenges", underscored: true, updatedAt: false }
);
