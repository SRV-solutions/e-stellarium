import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

// Cada aprobación o rechazo de una versión, con quién y el comentario (obligatorio al rechazar)
export class QuestionReview extends Model<InferAttributes<QuestionReview>, InferCreationAttributes<QuestionReview>> {
  declare id: CreationOptional<string>;
  declare versionId: string;
  declare reviewerId: string | null;
  declare decision: "approved" | "rejected";
  declare comment: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

QuestionReview.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    versionId: { type: DataTypes.UUID, allowNull: false },
    reviewerId: { type: DataTypes.UUID, allowNull: true },
    decision: { type: DataTypes.ENUM("approved", "rejected"), allowNull: false },
    comment: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: "question_reviews", underscored: true, updatedAt: false }
);
