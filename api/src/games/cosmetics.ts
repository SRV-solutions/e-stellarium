import type { Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { User, UserCosmetic } from "../models/index.js";

// Los cosméticos: no dan ninguna ventaja, solo se ven. Se compran una vez y se elige cuál llevar puesto.
// El catálogo está en el código, como los precios de la tienda; en el bloque 5 pasa a ser editable.
export type CosmeticKind = "frame" | "color" | "title";

export type Cosmetic = {
  id: string;
  kind: CosmeticKind;
  name: string;
  note: string;
  price: number;
  hex?: string; // el color del trazo
  variants?: [string, string]; // los títulos con dos formas: "Cazadora de cometas" o "Cazador de cometas"
};

// El azul de siempre: gratis y puesto si no eligió otro (worn_color vacío)
export const DEFAULT_COLOR = "blue";

export const COSMETICS: Cosmetic[] = [
  { id: "orbit", kind: "frame", name: "Órbita", note: "Una luna que gira", price: 120 },
  { id: "eclipse", kind: "frame", name: "Eclipse", note: "Corona de luz", price: 200 },
  { id: "rings", kind: "frame", name: "Anillos", note: "Como Saturno", price: 300 },
  { id: "blue", kind: "color", name: "Azul", note: "El de siempre", price: 0, hex: "#4fa3ff" },
  { id: "aurora", kind: "color", name: "Aurora", note: "Verde polar", price: 150, hex: "#3fe0a2" },
  { id: "nebula", kind: "color", name: "Nebulosa", note: "Violeta", price: 150, hex: "#b9a6ff" },
  { id: "corona", kind: "color", name: "Corona solar", note: "Oro", price: 250, hex: "#ffc94a" },
  {
    id: "comet_hunter",
    kind: "title",
    name: "Cazadora de cometas",
    note: "o Cazador",
    price: 100,
    variants: ["Cazadora de cometas", "Cazador de cometas"],
  },
  { id: "navigator", kind: "title", name: "Navegante", note: "", price: 100 },
  {
    id: "astronomer",
    kind: "title",
    name: "Astrónoma de guardia",
    note: "o Astrónomo",
    price: 180,
    variants: ["Astrónoma de guardia", "Astrónomo de guardia"],
  },
];

export function findCosmetic(id: unknown): Cosmetic | undefined {
  return COSMETICS.find((c) => c.id === id);
}

// El texto del título con la forma que eligió (los que tienen una sola forma la usan siempre)
export function titleText(titleId: string | null, variant: number): string | null {
  const title = titleId ? findCosmetic(titleId) : undefined;
  if (!title) return null;
  return title.variants ? title.variants[variant === 1 ? 1 : 0] : title.name;
}

// Lo que lleva puesto, como lo necesita el cliente
export function wornBy(user: User) {
  return {
    frame: user.wornFrame,
    color: user.wornColor ?? DEFAULT_COLOR,
    title: user.wornTitle,
    titleVariant: user.titleVariant,
    titleText: titleText(user.wornTitle, user.titleVariant),
  };
}

export async function ownedCosmetics(userId: string, t?: Transaction) {
  const rows = await UserCosmetic.findAll({ where: { userId }, transaction: t });
  return new Set([DEFAULT_COLOR, ...rows.map((r) => r.cosmeticId)]);
}

const COLUMN: Record<CosmeticKind, "wornFrame" | "wornColor" | "wornTitle"> = {
  frame: "wornFrame",
  color: "wornColor",
  title: "wornTitle",
};

// Se pone (o se saca, con id null) un cosmético. Solo lo que compró; el color no se saca: se vuelve al azul.
// Además del chequeo de acá, la base no deja poner algo que no esté en user_cosmetics.
export async function wear(userId: string, kind: CosmeticKind, id: string | null, variant = 0) {
  return sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
    if (!user) throw new HttpError(404, "No encontramos al alumno.");

    if (id !== null) {
      const cosmetic = findCosmetic(id);
      if (!cosmetic || cosmetic.kind !== kind) throw new HttpError(404, "No existe ese cosmético.");
      if (!(await ownedCosmetics(userId, t)).has(id)) throw new HttpError(409, "Todavía no lo compraste.");
    }
    if (kind === "color" && id === null) throw new HttpError(400, "Elegí un color.");

    // El azul de siempre se guarda como vacío: no es una fila de user_cosmetics
    const value = kind === "color" && id === DEFAULT_COLOR ? null : id;
    await user.update(
      { [COLUMN[kind]]: value, ...(kind === "title" ? { titleVariant: variant } : {}) },
      { transaction: t }
    );
    return wornBy(user);
  });
}
