import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

// Un cupón anulado desde el panel, con el motivo. Si tiene fila acá, no sirve en wearesrv.com.
// Tabla protegida (dvh): borrar la fila a mano revive el cupón, y la verificación lo marca.
export class CouponVoid extends Model<InferAttributes<CouponVoid>, InferCreationAttributes<CouponVoid>> {
  declare id: CreationOptional<string>;
  declare couponId: string;
  declare reason: string;
  declare voidedBy: string | null;
  declare createdAt: CreationOptional<Date>;
}

CouponVoid.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    couponId: { type: DataTypes.UUID, allowNull: false, unique: true },
    reason: { type: DataTypes.TEXT, allowNull: false },
    voidedBy: { type: DataTypes.UUID, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "coupon_voids", underscored: true, updatedAt: false }
);
