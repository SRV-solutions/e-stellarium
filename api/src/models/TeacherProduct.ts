import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../db.js";

// Qué cursos da cada docente: solo ve y edita el contenido de esos
export class TeacherProduct extends Model<InferAttributes<TeacherProduct>, InferCreationAttributes<TeacherProduct>> {
  declare userId: string;
  declare productId: string;
  declare createdAt: CreationOptional<Date>;
}

TeacherProduct.init(
  {
    userId: { type: DataTypes.UUID, primaryKey: true },
    productId: { type: DataTypes.UUID, primaryKey: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "teacher_products", underscored: true, updatedAt: false }
);
