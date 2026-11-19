import { randomUUID } from "node:crypto";
import { Op, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { Coupon, GlintEvent, ShopItem, User, UserCosmetic } from "../models/index.js";
import { COSMETIC_KINDS, ownedCosmetics, wornBy, type CosmeticKind } from "./cosmetics.js";
import { loadEconomy } from "./economy.js";
import { couponExpiresAt } from "./exam.js";
import { uniqueCouponCode } from "./examFlow.js";
import { spendGlints } from "./glints.js";
import { weekRange } from "./ranking.js";
import { addDays, argentinaDay } from "./streak.js";

// Lo que se vende y su precio en destellos está en shop_items (se edita desde el panel); el tope de
// protectores comprados por mes, en settings. Al comprar, el navegador manda solo el id ("coupon_10",
// "streak_freeze", "orbit"...): el precio nunca viene del navegador.
export type ItemId = string;

// Lo que está a la venta, en el orden de la tienda
export async function itemsForSale(t?: Transaction) {
  return ShopItem.findAll({ where: { active: true }, order: [["position", "ASC"]], transaction: t });
}

// El prefijo del código de los cupones de la tienda: ESTL-TI-7K3QM2
const SHOP_CODE_KEY = "tienda";

// El mes de Argentina que contiene `now`: del día 1 a las 00:00 al día 1 del mes siguiente (UTC-3)
export function monthRange(now: Date): { startsAt: Date; endsAt: Date } {
  const first = `${argentinaDay(now).slice(0, 7)}-01`;
  const nextFirst = `${addDays(first, 32).slice(0, 7)}-01`;
  return { startsAt: new Date(`${first}T03:00:00Z`), endsAt: new Date(`${nextFirst}T03:00:00Z`) };
}

// Por qué no se puede comprar algo, o null si se puede
export type Blocked = "glints" | "weekly_limit" | "monthly_limit" | "owned" | null;

export type ShopView = {
  glints: number;
  coupons: {
    item: ItemId;
    percent: number;
    price: number;
    missing: number; // cuántos destellos le faltan (0 si le alcanza)
    blockedBy: Blocked;
  }[];
  couponValidDays: number;
  couponBoughtThisWeek: boolean;
  couponAvailableAt: Date | null; // si ya compró uno esta semana, cuándo puede comprar otro
  freeze: {
    item: ItemId;
    price: number;
    missing: number;
    blockedBy: Blocked;
    boughtThisMonth: number;
    monthlyLimit: number;
    owned: number; // los comprados que todavía no usó
    availableAt: Date | null; // si ya compró los del mes, cuándo puede comprar otro
  };
  cosmetics: {
    item: string;
    kind: CosmeticKind;
    name: string;
    note: string;
    hex: string | null;
    variants: [string, string] | null;
    price: number;
    missing: number;
    owned: boolean;
    blockedBy: Blocked; // "owned" si ya lo tiene
  }[];
  worn: Awaited<ReturnType<typeof wornBy>>;
};

async function couponBoughtThisWeek(userId: string, now: Date, t?: Transaction) {
  const { startsAt, endsAt } = weekRange(now);
  const count = await Coupon.count({
    where: { userId, source: "shop", createdAt: { [Op.gte]: startsAt, [Op.lt]: endsAt } },
    transaction: t,
  });
  return count > 0;
}

async function freezesBoughtThisMonth(userId: string, now: Date, t?: Transaction) {
  const { startsAt, endsAt } = monthRange(now);
  return GlintEvent.count({
    where: { userId, reason: "freeze_purchase", createdAt: { [Op.gte]: startsAt, [Op.lt]: endsAt } },
    transaction: t,
  });
}

// La tienda como la ve este alumno: el saldo y, para cada cosa, si puede comprarla o por qué no
export async function shopView(user: User, now = new Date(), t?: Transaction): Promise<ShopView> {
  const glints = user.glints;
  const weekly = await couponBoughtThisWeek(user.id, now, t);
  const monthly = await freezesBoughtThisMonth(user.id, now, t);
  const missing = (price: number) => Math.max(0, price - glints);
  const owned = await ownedCosmetics(user.id, t);
  const economy = await loadEconomy(t);
  const items = await itemsForSale(t);
  const monthlyLimit = economy.freezes.boughtPerMonth;
  // El protector siempre existe (no se puede retirar): la migración lo crea y una restricción deja uno solo
  const freeze = items.find((i) => i.kind === "streak_freeze")!;

  const freezeBlocked: Blocked =
    monthly >= monthlyLimit ? "monthly_limit" : glints < freeze.price ? "glints" : null;

  return {
    glints,
    coupons: items
      .filter((i) => i.kind === "coupon")
      .map((c) => ({
        item: c.id,
        percent: c.percent!,
        price: c.price,
        missing: missing(c.price),
        blockedBy: weekly ? "weekly_limit" : glints < c.price ? "glints" : null,
      })),
    couponValidDays: economy.coupons.validDays,
    couponBoughtThisWeek: weekly,
    couponAvailableAt: weekly ? weekRange(now).endsAt : null,
    freeze: {
      item: freeze.id,
      price: freeze.price,
      missing: missing(freeze.price),
      blockedBy: freezeBlocked,
      boughtThisMonth: monthly,
      monthlyLimit,
      owned: user.boughtFreezes,
      availableAt: monthly >= monthlyLimit ? monthRange(now).endsAt : null,
    },
    // Los retirados no se ven, salvo que ya lo tenga (así sigue viendo lo suyo y lo puede llevar)
    cosmetics: (await cosmeticsFor(owned, items, t)).map((c) => ({
      item: c.id,
      kind: c.kind as CosmeticKind,
      name: c.name,
      note: c.note,
      hex: c.hex,
      effect: c.effect,
      variants: c.altName ? ([c.name, c.altName] as [string, string]) : null,
      price: c.price,
      missing: owned.has(c.id) ? 0 : missing(c.price),
      owned: owned.has(c.id),
      blockedBy: owned.has(c.id) ? "owned" : glints < c.price ? "glints" : null,
    })),
    worn: await wornBy(user, t),
  };
}

const BLOCKED_MESSAGE: Record<Exclude<Blocked, null>, string> = {
  glints: "No te alcanzan los destellos.",
  weekly_limit: "Ya compraste un cupón esta semana. El lunes podés comprar otro.",
  monthly_limit: "Ya compraste todos los protectores de este mes.",
  owned: "Ya lo tenés.",
};

// Los cosméticos que se ven en la tienda: los que están a la venta y los retirados que ya tiene
async function cosmeticsFor(owned: Set<string>, forSale: ShopItem[], t?: Transaction) {
  const retired = await ShopItem.findAll({
    where: { active: false, kind: COSMETIC_KINDS, id: [...owned] },
    transaction: t,
  });
  return [...forSale.filter((i) => (COSMETIC_KINDS as string[]).includes(i.kind)), ...retired].sort(
    (a, b) => a.position - b.position
  );
}

export function isItemId(value: unknown): value is ItemId {
  return typeof value === "string" && value.length > 0 && value.length <= 40;
}

export type Purchase = {
  item: ItemId;
  coupon: { code: string; percent: number; expiresAt: Date } | null;
  shop: ShopView; // la tienda después de comprar, con el saldo nuevo
};

// Compra algo. Bloquea al alumno: dos compras a la vez no pueden gastar los mismos destellos
// ni pasar los límites de la semana o del mes.
export async function buy(userId: string, item: ItemId, now = new Date()): Promise<Purchase> {
  return sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
    if (!user) throw new HttpError(404, "No encontramos al alumno.");

    const before = await shopView(user, now, t);
    let coupon: Purchase["coupon"] = null;

    const cosmetic = before.cosmetics.find((c) => c.item === item);
    if (cosmetic) {
      if (cosmetic.blockedBy) throw new HttpError(409, BLOCKED_MESSAGE[cosmetic.blockedBy]);
      const row = await UserCosmetic.create({ userId: user.id, cosmeticId: cosmetic.item }, { transaction: t });
      await spendGlints(user, "cosmetic_purchase", row.id, cosmetic.price, t);
    } else if (item === before.freeze.item) {
      if (before.freeze.blockedBy) throw new HttpError(409, BLOCKED_MESSAGE[before.freeze.blockedBy]);
      // Un protector no es una fila: la referencia del movimiento es un id nuevo
      await spendGlints(user, "freeze_purchase", randomUUID(), before.freeze.price, t);
      await user.increment("boughtFreezes", { by: 1, transaction: t });
    } else {
      const offer = before.coupons.find((c) => c.item === item);
      if (!offer) throw new HttpError(404, "No existe eso en la tienda.");
      if (offer.blockedBy) throw new HttpError(409, BLOCKED_MESSAGE[offer.blockedBy]);
      const created = await Coupon.create(
        {
          code: await uniqueCouponCode(SHOP_CODE_KEY, t),
          percent: offer.percent,
          expiresAt: couponExpiresAt(now, (await loadEconomy(t)).coupons),
          source: "shop",
          userId: user.id,
          constellationId: null,
          examAttemptId: null,
        },
        { transaction: t }
      );
      await spendGlints(user, "coupon_purchase", created.id, offer.price, t);
      coupon = { code: created.code, percent: created.percent, expiresAt: created.expiresAt };
    }

    return { item, coupon, shop: await shopView(user, now, t) };
  });
}
