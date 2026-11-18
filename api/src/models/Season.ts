import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

// Una temporada del ranking. La abierta (endedAt vacío) es una sola; cerrarla no borra nada de nadie.
export class Season extends Model<InferAttributes<Season>, InferCreationAttributes<Season>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare startedAt: Date;
  declare endedAt: CreationOptional<Date | null>;
  declare closedBy: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

Season.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING(60), allowNull: false },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    endedAt: { type: DataTypes.DATE, allowNull: true },
    closedBy: { type: DataTypes.UUID, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "seasons", underscored: true, updatedAt: false }
);
