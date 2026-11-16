import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db.js";

// Los tipos de aviso de la campanita (el cliente elige el dibujo con esto)
export const NOTIFICATION_KINDS = [
  "courses", // le dieron cursos
  "coupon", // ganó o le regalaron un cupón
  "coupon_expiring", // un cupón vence en 2 días o menos
  "streak_risk", // tiene racha y hoy no jugó (desde las 18)
  "badge", // ganó una insignia
  "challenge", // salió un desafío
  "content_review", // staff: una pregunta espera revisión
  "content_approved", // docente: aprobaron su pregunta
  "content_rejected", // docente: le devolvieron su pregunta
  "challenge_bank_low", // staff: se acaban las preguntas de desafío de un curso y dificultad
  "integrity_fail", // super admins: falló la verificación
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// Un aviso de la campanita. No es protegida: las leídas se borran a los 90 días
export class Notification extends Model<InferAttributes<Notification>, InferCreationAttributes<Notification>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare kind: NotificationKind;
  declare title: string;
  declare body: string;
  declare link: string | null;
  declare key: string | null; // para no repetir los que se crean al pedir la campanita
  declare emailSent: CreationOptional<boolean>; // también se mandó por mail
  declare createdAt: CreationOptional<Date>;
  declare readAt: CreationOptional<Date | null>;
}

Notification.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.STRING(40), allowNull: false },
    title: { type: DataTypes.TEXT, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    link: { type: DataTypes.TEXT, allowNull: true },
    key: { type: DataTypes.STRING(120), allowNull: true },
    emailSent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: DataTypes.DATE,
    readAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: "notifications", underscored: true, updatedAt: false }
);
