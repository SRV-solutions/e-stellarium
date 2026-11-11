import { randomUUID } from "node:crypto";
import { Op, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { Coupon, GlintEvent, User } from "../models/index.js";
import { COUPON_VALID_DAYS, couponExpiresAt } from "./exam.js";
import { uniqueCouponCode } from "./examFlow.js";
import { spendGlints } from "./glints.js";
import { weekRange } from "./ranking.js";
import { addDays, argentinaDay } from "./streak.js";

// Los precios, en destellos. Por ahora en el código; en el bloque 5 pasan a ser editables
export const SHOP_COUPONS = [
  { item: "coupon_10", percent: 10, price: 150 },
  { item: "coupon_20", percent: 20, price: 350 },
  { item: "coupon_30", percent: 30, price: 700 },
] as const;
export const FREEZE_PRICE = 60;
export const FREEZES_BOUGHT_PER_MONTH = 2;

// Lo que se puede pedir al comprar. El precio nunca viene del navegador: sale de acá
export type ShopItem = (typeof SHOP_COUPONS)[number]["item"] | "streak_freeze";

// El prefijo del código de los cupones de la tienda: ESTL-TI-7K3QM2
const SHOP_CODE_KEY = "tienda";

// El mes de Argentina que contiene `now`: del día 1 a las 00:00 al día 1 del mes siguiente (UTC-3)
export function monthRange(now: Date): { startsAt: Date; endsAt: Date } {
  const first = `${argentinaDay(now).slice(0, 7)}-01`;
  const nextFirst = `${addDays(first, 32).slice(0, 7)}-01`;
  return { startsAt: new Date(`${first}T03:00:00Z`), endsAt: new Date(`${nextFirst}T03:00:00Z`) };
}

// Por qué no se puede comprar algo, o null si se puede
export type Blocked = "glints" | "weekly_limit" | "monthly_limit" | null;

export type ShopView = {
  glints: number;
  coupons: {
    item: ShopItem;
    percent: number;
    price: number;
    missing: number; // cuántos destellos le faltan (0 si le alcanza)
    blockedBy: Blocked;
  }[];
  couponValidDays: number;
  couponBoughtThisWeek: boolean;
  couponAvailableAt: Date | null; // si ya compró uno esta semana, cuándo puede comprar otro
  freeze: {
    item: ShopItem;
    price: number;
    missing: number;
    blockedBy: Blocked;
    boughtThisMonth: number;
    monthlyLimit: number;
    owned: number; // los comprados que todavía no usó
    availableAt: Date | null; // si ya compró los del mes, cuándo puede comprar otro
  };
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

  const freezeBlocked: Blocked =
    monthly >= FREEZES_BOUGHT_PER_MONTH ? "monthly_limit" : glints < FREEZE_PRICE ? "glints" : null;

  return {
    glints,
    coupons: SHOP_COUPONS.map((c) => ({
      item: c.item,
      percent: c.percent,
      price: c.price,
      missing: missing(c.price),
      blockedBy: weekly ? "weekly_limit" : glints < c.price ? "glints" : null,
    })),
    couponValidDays: COUPON_VALID_DAYS,
    couponBoughtThisWeek: weekly,
    couponAvailableAt: weekly ? weekRange(now).endsAt : null,
    freeze: {
      item: "streak_freeze",
      price: FREEZE_PRICE,
      missing: missing(FREEZE_PRICE),
      blockedBy: freezeBlocked,
      boughtThisMonth: monthly,
      monthlyLimit: FREEZES_BOUGHT_PER_MONTH,
      owned: user.boughtFreezes,
      availableAt: monthly >= FREEZES_BOUGHT_PER_MONTH ? monthRange(now).endsAt : null,
    },
  };
}

const BLOCKED_MESSAGE: Record<Exclude<Blocked, null>, string> = {
  glints: "No te alcanzan los destellos.",
  weekly_limit: "Ya compraste un cupón esta semana. El lunes podés comprar otro.",
  monthly_limit: "Ya compraste los 2 protectores de este mes.",
};

export function isShopItem(value: unknown): value is ShopItem {
  return value === "streak_freeze" || SHOP_COUPONS.some((c) => c.item === value);
}

export type Purchase = {
  item: ShopItem;
  coupon: { code: string; percent: number; expiresAt: Date } | null;
  shop: ShopView; // la tienda después de comprar, con el saldo nuevo
};

// Compra algo. Bloquea al alumno: dos compras a la vez no pueden gastar los mismos destellos
// ni pasar los límites de la semana o del mes.
export async function buy(userId: string, item: ShopItem, now = new Date()): Promise<Purchase> {
  return sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
    if (!user) throw new HttpError(404, "No encontramos al alumno.");

    const before = await shopView(user, now, t);
    let coupon: Purchase["coupon"] = null;

    if (item === "streak_freeze") {
      if (before.freeze.blockedBy) throw new HttpError(409, BLOCKED_MESSAGE[before.freeze.blockedBy]);
      // Un protector no es una fila: la referencia del movimiento es un id nuevo
      await spendGlints(user, "freeze_purchase", randomUUID(), FREEZE_PRICE, t);
      await user.increment("boughtFreezes", { by: 1, transaction: t });
    } else {
      const offer = before.coupons.find((c) => c.item === item)!;
      if (offer.blockedBy) throw new HttpError(409, BLOCKED_MESSAGE[offer.blockedBy]);
      const created = await Coupon.create(
        {
          code: await uniqueCouponCode(SHOP_CODE_KEY, t),
          percent: offer.percent,
          expiresAt: couponExpiresAt(now),
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
