import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../db.js";

export type RoleKey = "student" | "teacher" | "admin" | "super_admin";

// Los cuatro roles. Las filas las crea la migración; la API no agrega ni borra roles
export class Role extends Model<InferAttributes<Role>, InferCreationAttributes<Role>> {
  declare id: number;
  declare key: RoleKey;
  declare name: string;
}

Role.init(
  {
    id: { type: DataTypes.SMALLINT, primaryKey: true },
    key: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(60), allowNull: false },
  },
  { sequelize, tableName: "roles", underscored: true, timestamps: false }
);
