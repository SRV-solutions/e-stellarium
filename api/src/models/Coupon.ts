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

// De dónde sale: aprobar el examen de una constelación, la tienda (con destellos) o cargado a mano
export type CouponSource = "constellation" | "shop" | "manual";

export class Coupon extends Model<InferAttributes<Coupon>, InferCreationAttributes<Coupon>> {
  declare id: CreationOptional<string>;
  declare code: string;
  declare percent: number;
  declare expiresAt: Date;
  declare usedAt: CreationOptional<Date | null>;
  declare userId: string;
  declare source: CouponSource;
  declare constellationId: string | null; // solo los de constelación
  declare examAttemptId: string | null; // el intento aprobado que lo dio
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
    source: { type: DataTypes.ENUM("constellation", "shop", "manual"), allowNull: false },
    constellationId: { type: DataTypes.UUID, allowNull: true },
    examAttemptId: { type: DataTypes.UUID, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "coupons", underscored: true, updatedAt: false }
);
