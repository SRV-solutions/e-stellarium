import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from "sequelize";
import { sequelize } from "../db.js";
import type { Product } from "./Product.js";
import type { Star } from "./Star.js";

export type QuestionType = "output" | "fill_blank" | "order_lines" | "multiple_choice";
export type Difficulty = "easy" | "medium" | "hard";
export type QuestionStatus = "draft" | "in_review" | "published" | "rejected";

// Lo que ve el alumno, según el tipo de juego
export type OutputContent = { code: string; options: string[] };
export type FillBlankContent = { code: string; blanks: string[][] };
export type OrderLinesContent = { lines: string[] };
export type MultipleChoiceContent = { options: string[] };
export type QuestionContent =
  | OutputContent
  | FillBlankContent
  | OrderLinesContent
  | MultipleChoiceContent;

// La respuesta correcta, según el tipo de juego
export type QuestionAnswer = { correct: number } | { correct: number[] } | { order: number[] };

export class Question extends Model<InferAttributes<Question>, InferCreationAttributes<Question>> {
  declare id: CreationOptional<string>;
  declare productId: string;
  declare starId: CreationOptional<string | null>;
  declare position: CreationOptional<number | null>;
  declare type: QuestionType;
  declare difficulty: Difficulty;
  declare topic: string;
  declare prompt: string;
  declare content: QuestionContent;
  // Solo viene cargada con Question.scope("withAnswer")
  declare answer: QuestionAnswer;
  declare explanation: string;
  declare status: CreationOptional<QuestionStatus>;
  declare authorId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare Product?: NonAttribute<Product>;
  declare Star?: NonAttribute<Star>;
}

Question.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    productId: { type: DataTypes.UUID, allowNull: false },
    starId: { type: DataTypes.UUID, allowNull: true },
    position: { type: DataTypes.INTEGER, allowNull: true },
    type: {
      type: DataTypes.ENUM("output", "fill_blank", "order_lines", "multiple_choice"),
      allowNull: false,
    },
    difficulty: { type: DataTypes.ENUM("easy", "medium", "hard"), allowNull: false },
    topic: { type: DataTypes.STRING(60), allowNull: false },
    prompt: { type: DataTypes.TEXT, allowNull: false },
    content: { type: DataTypes.JSONB, allowNull: false },
    answer: { type: DataTypes.JSONB, allowNull: false },
    explanation: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM("draft", "in_review", "published", "rejected"),
      allowNull: false,
      defaultValue: "draft",
    },
    authorId: { type: DataTypes.UUID, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "questions",
    underscored: true,
    // La respuesta nunca sale en una consulta normal
    defaultScope: { attributes: { exclude: ["answer"] } },
    scopes: { withAnswer: {} },
  }
);