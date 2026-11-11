import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export type GlintReason =
  | "challenge_correct"
  | "challenge_completed"
  | "review_completed"
  | "streak_badge"
  | "coupon_purchase" // gastados en la tienda
  | "freeze_purchase";

// Un movimiento de destellos: positivo si los ganó, negativo si los gastó
export class GlintEvent extends Model<InferAttributes<GlintEvent>, InferCreationAttributes<GlintEvent>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare amount: number;
  declare reason: GlintReason;
  declare referenceId: string;
  declare createdAt: CreationOptional<Date>;
}

GlintEvent.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING(40), allowNull: false },
    referenceId: { type: DataTypes.UUID, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "glint_events", underscored: true, updatedAt: false }
);
