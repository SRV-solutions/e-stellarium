import { Router } from "express";
import { Op } from "sequelize";
import { sequelize } from "../db.js";
import { Constellation, Coupon, Product } from "../models/index.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireInternalKey } from "../middlewares/requireInternalKey.js";

export const couponsRouter = Router();

// Los cupones del alumno, del más nuevo al más viejo
couponsRouter.get("/coupons", requireAuth, async (req, res) => {
  const coupons = await Coupon.findAll({
    where: { userId: req.user!.id },
    include: [{ model: Constellation, include: [Product] }],
    order: [["createdAt", "DESC"]],
  });

  res.json({
    coupons: coupons.map((c) => ({
      code: c.code,
      percent: c.percent,
      expiresAt: c.expiresAt,
      usedAt: c.usedAt,
      createdAt: c.createdAt,
      source: c.source,
      // Solo los de constelación tienen curso; los de la tienda sirven para cualquiera
      course: c.Constellation ? { key: c.Constellation.Product!.key, name: c.Constellation.Product!.name } : null,
    })),
  });
});

// Lo usa wearesrv.com, con la clave interna. No se chequea de quién es el cupón: es transferible.
type CouponCheck =
  | { valid: true; code: string; percent: number; expiresAt: Date }
  | { valid: false; reason: "not_found" | "used" | "expired" };

function normalize(code: unknown) {
  return typeof code === "string" ? code.trim().toUpperCase() : "";
}

function describe(coupon: Coupon | null, now = new Date()): CouponCheck {
  if (!coupon) return { valid: false, reason: "not_found" };
  if (coupon.usedAt) return { valid: false, reason: "used" };
  if (coupon.expiresAt <= now) return { valid: false, reason: "expired" };
  return { valid: true, code: coupon.code, percent: coupon.percent, expiresAt: coupon.expiresAt };
}

// Solo consulta: para mostrar el descuento en el checkout antes de pagar
couponsRouter.post("/coupons/validate", requireInternalKey, async (req, res) => {
  const coupon = await Coupon.findOne({ where: { code: normalize(req.body?.code) } });
  res.json(describe(coupon));
});

// Lo consume: se llama cuando se confirma la compra. Un solo UPDATE, así dos compras
// al mismo tiempo no pueden usar el mismo cupón: la segunda no encuentra la fila sin usar.
couponsRouter.post("/coupons/redeem", requireInternalKey, async (req, res) => {
  const code = normalize(req.body?.code);
  const now = new Date();

  // En una transacción para que se selle el dvh del cupón (tabla protegida)
  const [count] = await sequelize.transaction((t) =>
    Coupon.update({ usedAt: now }, { where: { code, usedAt: null, expiresAt: { [Op.gt]: now } }, transaction: t })
  );

  const coupon = await Coupon.findOne({ where: { code } });
  if (count === 1) {
    res.json({ valid: true, code: coupon!.code, percent: coupon!.percent, expiresAt: coupon!.expiresAt });
    return;
  }
  res.status(409).json(describe(coupon, now));
});
