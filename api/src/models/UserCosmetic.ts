import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

// Un cosmético que compró el alumno. Se compra una sola vez
export class UserCosmetic extends Model<InferAttributes<UserCosmetic>, InferCreationAttributes<UserCosmetic>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare cosmeticId: string;
  declare purchasedAt: CreationOptional<Date>;
}

UserCosmetic.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.UUID, allowNull: false },
    cosmeticId: { type: DataTypes.STRING(40), allowNull: false },
    purchasedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: "user_cosmetics", underscored: true, timestamps: false }
);
