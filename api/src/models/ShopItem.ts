import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

export type ShopItemKind = "coupon" | "streak_freeze" | "frame" | "color" | "title";

// Lo que se vende en la tienda. No se borra: se retira (active = false), y quien lo compró lo sigue teniendo
export class ShopItem extends Model<InferAttributes<ShopItem>, InferCreationAttributes<ShopItem>> {
  declare id: string;
  declare kind: ShopItemKind;
  declare name: string;
  declare note: CreationOptional<string>;
  declare price: number;
  declare percent: number | null; // solo los cupones
  declare hex: string | null; // solo los colores
  declare effect: string | null; // solo los colores: cómo se anima el trazo (TRAIL_EFFECTS); vacío = sin animación
  declare altName: string | null; // la otra forma de un título: "Cazador de cometas"
  declare position: number;
  declare active: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ShopItem.init(
  {
    id: { type: DataTypes.STRING(40), primaryKey: true },
    kind: { type: DataTypes.ENUM("coupon", "streak_freeze", "frame", "color", "title"), allowNull: false },
    name: { type: DataTypes.STRING(60), allowNull: false },
    note: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "" },
    price: { type: DataTypes.INTEGER, allowNull: false },
    percent: { type: DataTypes.SMALLINT, allowNull: true },
    hex: { type: DataTypes.STRING(7), allowNull: true },
    effect: { type: DataTypes.STRING(12), allowNull: true },
    altName: { type: DataTypes.STRING(60), allowNull: true },
    position: { type: DataTypes.SMALLINT, allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  },
  { sequelize, tableName: "shop_items", underscored: true }
);
