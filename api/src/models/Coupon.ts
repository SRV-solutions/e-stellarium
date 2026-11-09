import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from "sequelize";
import { sequelize } from "../db.js";
import type { Constellation } from "./Constellation.js";

export class Coupon extends Model<InferAttributes<Coupon>, InferCreationAttributes<Coupon>> {
  declare id: CreationOptional<string>;
  declare code: string;
  declare percent: number;
  declare expiresAt: Date;
  declare usedAt: CreationOptional<Date | null>;
  declare userId: string;
  declare constellationId: string;
  declare examAttemptId: string;
  declare createdAt: CreationOptional<Date>;

  declare Constellation?: NonAttribute<Constellation>;
}

Coupon.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    code: { type: DataTypes.STRING(20), allowNull: false },
    percent: { type: DataTypes.INTEGER, allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE, allowNull: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    constellationId: { type: DataTypes.UUID, allowNull: false },
    examAttemptId: { type: DataTypes.UUID, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "coupons", underscored: true, updatedAt: false }
);
