import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../db.js";

// Una fila de la foto del top de una tabla al cerrar una temporada (alias y nombre de ese momento)
export class SeasonSnapshot extends Model<InferAttributes<SeasonSnapshot>, InferCreationAttributes<SeasonSnapshot>> {
  declare id: CreationOptional<string>;
  declare seasonId: string;
  declare board: string;
  declare position: number;
  declare userId: string | null;
  declare alias: string;
  declare name: string;
  declare value: number;
}

SeasonSnapshot.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    seasonId: { type: DataTypes.UUID, allowNull: false },
    board: { type: DataTypes.STRING(20), allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: true },
    alias: { type: DataTypes.STRING(40), allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    value: { type: DataTypes.INTEGER, allowNull: false },
  },
  { sequelize, tableName: "season_snapshots", underscored: true, timestamps: false }
);
