import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

// Quien pidió el cupón de la demo: su email (normalizado, único) y el cupón que se le mandó.
// No es un usuario: el invitado no tiene cuenta.
export class DemoLead extends Model<InferAttributes<DemoLead>, InferCreationAttributes<DemoLead>> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare couponId: string;
  declare ip: string | null;
  declare createdAt: CreationOptional<Date>;
}

DemoLead.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
    couponId: { type: DataTypes.UUID, allowNull: false, unique: true },
    ip: { type: DataTypes.STRING(45), allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "demo_leads", underscored: true, updatedAt: false }
);
