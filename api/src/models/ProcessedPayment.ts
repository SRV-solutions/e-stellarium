import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export class ProcessedPayment extends Model<
  InferAttributes<ProcessedPayment>,
  InferCreationAttributes<ProcessedPayment>
> {
  declare paymentId: string;
  declare createdAt: CreationOptional<Date>;
}

ProcessedPayment.init(
  {
    paymentId: { type: DataTypes.STRING(30), primaryKey: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "processed_payments", underscored: true, updatedAt: false }
);