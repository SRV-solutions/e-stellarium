import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export type EnrollmentStatus = "active" | "revoked";

export class Enrollment extends Model<InferAttributes<Enrollment>, InferCreationAttributes<Enrollment>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare productId: string;
  declare paymentId: CreationOptional<string | null>;
  declare status: CreationOptional<EnrollmentStatus>;
  declare purchasedAt: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Enrollment.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.UUID, allowNull: false },
    productId: { type: DataTypes.UUID, allowNull: false },
    paymentId: { type: DataTypes.STRING(30), allowNull: true },
    status: {
      type: DataTypes.ENUM("active", "revoked"),
      allowNull: false,
      defaultValue: "active",
    },
    purchasedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: "enrollments", underscored: true }
);