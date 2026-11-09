import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export type XpReason = "question_correct" | "star_completed" | "exam_passed";

export class XpEvent extends Model<InferAttributes<XpEvent>, InferCreationAttributes<XpEvent>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare xp: number;
  declare reason: XpReason;
  declare referenceId: string;
  declare createdAt: CreationOptional<Date>;
}

XpEvent.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.UUID, allowNull: false },
    xp: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING(40), allowNull: false },
    referenceId: { type: DataTypes.UUID, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "xp_events", underscored: true, updatedAt: false }
);