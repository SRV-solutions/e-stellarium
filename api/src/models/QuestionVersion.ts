import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from "sequelize";
import { sequelize } from "../db.js";
import type { Difficulty, QuestionAnswer, QuestionContent, QuestionType } from "./Question.js";
import type { User } from "./User.js";

// draft, in_review y rejected: la versión abierta (hay una sola por pregunta).
// published: la aprobada, que es la que está copiada en questions. replaced: una aprobada que quedó vieja.
export type VersionStatus = "draft" | "in_review" | "rejected" | "published" | "replaced";

// Cada versión de una pregunta, entera. Tiene la respuesta correcta: solo la lee el panel y el corrector
export class QuestionVersion extends Model<InferAttributes<QuestionVersion>, InferCreationAttributes<QuestionVersion>> {
  declare id: CreationOptional<string>;
  declare questionId: string;
  declare number: number;
  declare status: CreationOptional<VersionStatus>;
  declare type: QuestionType;
  declare difficulty: Difficulty;
  declare topic: string;
  declare module: CreationOptional<number | null>;
  declare prompt: string;
  declare content: QuestionContent;
  declare answer: QuestionAnswer;
  declare explanation: string;
  declare authorId: CreationOptional<string | null>;
  declare submittedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare Author?: NonAttribute<User>;
}

QuestionVersion.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    questionId: { type: DataTypes.UUID, allowNull: false },
    number: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM("draft", "in_review", "rejected", "published", "replaced"),
      allowNull: false,
      defaultValue: "draft",
    },
    type: { type: DataTypes.ENUM("output", "fill_blank", "order_lines", "multiple_choice"), allowNull: false },
    difficulty: { type: DataTypes.ENUM("easy", "medium", "hard"), allowNull: false },
    topic: { type: DataTypes.STRING(60), allowNull: false },
    module: { type: DataTypes.INTEGER, allowNull: true },
    prompt: { type: DataTypes.TEXT, allowNull: false },
    content: { type: DataTypes.JSONB, allowNull: false },
    answer: { type: DataTypes.JSONB, allowNull: false },
    explanation: { type: DataTypes.TEXT, allowNull: false },
    authorId: { type: DataTypes.UUID, allowNull: true },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: "question_versions", underscored: true }
);
