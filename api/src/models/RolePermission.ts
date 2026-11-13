import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";
import type { Permission } from "../lib/permissions.js";

// Qué permiso tiene cada rol (única por rol y permiso). El super admin no tiene filas
export class RolePermission extends Model<InferAttributes<RolePermission>, InferCreationAttributes<RolePermission>> {
  declare id: CreationOptional<string>;
  declare roleId: number;
  declare permissionKey: Permission;
}

RolePermission.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    roleId: { type: DataTypes.SMALLINT, allowNull: false },
    permissionKey: { type: DataTypes.STRING(40), allowNull: false },
  },
  { sequelize, tableName: "role_permissions", underscored: true, timestamps: false }
);
