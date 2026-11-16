import { Router } from "express";
import { sequelize } from "../db.js";
import { Constellation, Coupon, CouponVoid, Product } from "../models/index.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireInternalKey } from "../middlewares/requireInternalKey.js";

export const couponsRouter = Router();

// Los cupones del alumno, del más nuevo al más viejo
couponsRouter.get("/coupons", requireAuth, async (req, res) => {
  const coupons = await Coupon.findAll({
    where: { userId: req.user!.id },
    include: [{ model: Constellation, include: [Product] }, CouponVoid],
    order: [["createdAt", "DESC"]],
  });

  res.json({
    coupons: coupons.map((c) => ({
      code: c.code,
      percent: c.percent,
      expiresAt: c.expiresAt,
      usedAt: c.usedAt,
      voided: !!c.CouponVoid, // anulado desde el panel (el motivo es para el staff)
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
  | { valid: false; reason: "not_found" | "used" | "expired" | "voided" };

function normalize(code: unknown) {
  return typeof code === "string" ? code.trim().toUpperCase() : "";
}

function describe(coupon: Coupon | null, voided: boolean, now = new Date()): CouponCheck {
  if (!coupon) return { valid: false, reason: "not_found" };
  if (voided) return { valid: false, reason: "voided" };
  if (coupon.usedAt) return { valid: false, reason: "used" };
  if (coupon.expiresAt <= now) return { valid: false, reason: "expired" };
  return { valid: true, code: coupon.code, percent: coupon.percent, expiresAt: coupon.expiresAt };
}

// Solo consulta: para mostrar el descuento en el checkout antes de pagar
couponsRouter.post("/coupons/validate", requireInternalKey, async (req, res) => {
  const coupon = await Coupon.findOne({ where: { code: normalize(req.body?.code) }, include: [CouponVoid] });
  res.json(describe(coupon, !!coupon?.CouponVoid));
});

// Lo consume: se llama cuando se confirma la compra. Bloquea la fila del cupón (FOR UPDATE): dos compras
// al mismo tiempo, o una compra y una anulación desde el panel, van en fila, y la segunda ya ve la primera.
couponsRouter.post("/coupons/redeem", requireInternalKey, async (req, res) => {
  const code = normalize(req.body?.code);
  const now = new Date();

  // En una transacción para que se selle el dvh del cupón (tabla protegida)
  const result = await sequelize.transaction(async (t) => {
    const coupon = await Coupon.findOne({ where: { code }, lock: t.LOCK.UPDATE, transaction: t });
    const voided = coupon ? (await CouponVoid.count({ where: { couponId: coupon.id }, transaction: t })) > 0 : false;
    const check = describe(coupon, voided, now);
    if (check.valid) await coupon!.update({ usedAt: now }, { transaction: t });
    return check;
  });

  if (result.valid) {
    res.json(result);
    return;
  }
  res.status(409).json(result);
});
