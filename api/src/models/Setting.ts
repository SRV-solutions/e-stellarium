import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../db.js";

// Un valor de la economía ("xp.star_completed" = 50). Las filas las crea la migración;
// qué claves existen y entre qué números van está en games/economy.ts
export class Setting extends Model<InferAttributes<Setting>, InferCreationAttributes<Setting>> {
  declare id: string;
  declare value: number;
  declare updatedAt: Date;
}

Setting.init(
  {
    id: { type: DataTypes.STRING(40), primaryKey: true },
    value: { type: DataTypes.INTEGER, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: "settings", underscored: true, createdAt: false }
);
