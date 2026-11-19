import type { Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { ShopItem, User, UserCosmetic } from "../models/index.js";

// Los cosméticos: no dan ninguna ventaja, solo se ven. Se compran una vez y se elige cuál llevar puesto.
// El catálogo (nombres, precios, colores y títulos) está en shop_items y se edita desde el panel.
export type CosmeticKind = "frame" | "color" | "title";
export const COSMETIC_KINDS: CosmeticKind[] = ["frame", "color", "title"];

// Los efectos de un color de trazo (shop_items.effect): el cliente anima la línea según cuál lleve puesto.
// Si se agrega uno, también va en la restricción de la tabla (migración) y en el cliente (lib/trail.ts)
export const TRAIL_EFFECTS = ["twinkle", "pulse", "flow", "comet", "rainbow"] as const;
export type TrailEffect = (typeof TRAIL_EFFECTS)[number];

// El azul de siempre: gratis y puesto si no eligió otro (worn_color vacío)
export const DEFAULT_COLOR = "blue";

// Un cosmético por su id, aunque esté retirado (quien lo compró lo sigue pudiendo llevar)
export async function findCosmetic(id: unknown, t?: Transaction): Promise<ShopItem | null> {
  if (typeof id !== "string") return null;
  return ShopItem.findOne({ where: { id, kind: COSMETIC_KINDS }, transaction: t });
}

// El texto del título con la forma que eligió (los que tienen una sola forma usan siempre el nombre)
export function titleText(title: ShopItem | null, variant: number): string | null {
  if (!title) return null;
  return variant === 1 && title.altName ? title.altName : title.name;
}

// Lo que lleva puesto, como lo necesita el cliente. colorHex es el color del trazo (sale de la tienda,
// así un color nuevo funciona sin tocar el cliente)
export async function wornBy(user: User, t?: Transaction) {
  const color = user.wornColor ?? DEFAULT_COLOR;
  const [title, colorItem] = await Promise.all([
    user.wornTitle ? findCosmetic(user.wornTitle, t) : null,
    findCosmetic(color, t),
  ]);
  return {
    frame: user.wornFrame,
    color,
    colorHex: colorItem?.hex ?? null,
    colorEffect: colorItem?.effect ?? null,
    title: user.wornTitle,
    titleVariant: user.titleVariant,
    titleText: titleText(title, user.titleVariant),
  };
}

// El trazo que lleva puesto, para la sesión del navegador: su color y su efecto salen de la tienda
export async function trailOf(user: User, t?: Transaction) {
  const item = await findCosmetic(user.wornColor ?? DEFAULT_COLOR, t);
  return { wornColorHex: item?.hex ?? null, wornColorEffect: item?.effect ?? null };
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
      const cosmetic = await findCosmetic(id, t);
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
    return wornBy(user, t);
  });
}
