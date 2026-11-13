import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../db.js";

// Solo para leer: los registros se escriben con writeAudit (lib/audit.ts), que arma la cadena de hashes
export class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: number;
  declare createdAt: Date;
  declare actorId: string | null;
  declare ip: string | null;
  declare action: string;
  declare targetType: string | null;
  declare targetId: string | null;
  declare before: unknown;
  declare after: unknown;
  declare reversible: boolean;
  declare revertsId: number | null;
  declare prevHash: string | null;
  declare hash: string;
}

AuditLog.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    actorId: { type: DataTypes.UUID, allowNull: true },
    ip: { type: DataTypes.STRING(45), allowNull: true },
    action: { type: DataTypes.STRING(60), allowNull: false },
    targetType: { type: DataTypes.STRING(40), allowNull: true },
    targetId: { type: DataTypes.STRING(64), allowNull: true },
    before: { type: DataTypes.JSONB, allowNull: true },
    after: { type: DataTypes.JSONB, allowNull: true },
    reversible: { type: DataTypes.BOOLEAN, allowNull: false },
    revertsId: { type: DataTypes.INTEGER, allowNull: true },
    prevHash: { type: DataTypes.CHAR(64), allowNull: true },
    hash: { type: DataTypes.CHAR(64), allowNull: false },
  },
  { sequelize, tableName: "audit_logs", underscored: true, timestamps: false }
);
