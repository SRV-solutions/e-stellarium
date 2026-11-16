import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { Coupon, CouponVoid, User } from "../models/index.js";
import { HttpError } from "../lib/errors.js";
import { dateOf, notify } from "../lib/notify.js";
import { writeAudit, type AuditContext } from "../lib/audit.js";
import { loadEconomy, SETTINGS } from "../games/economy.js";
import { uniqueCouponCode } from "../games/examFlow.js";
import type { ChangeOptions } from "./users.js";

// Los cupones del panel (coupons:manage): la lista de todos, emitir uno de regalo y anular uno sin usar.
// Anular no toca la fila del cupón: agrega una en coupon_voids (protegida). Revertir la anulación la borra.

export const COUPONS_PAGE_SIZE = 50;
const STATUSES = ["live", "used", "expired", "void", "all"] as const;
type Status = (typeof STATUSES)[number];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// El prefijo de los cupones de regalo: ESTL-RG-7K3QM2
const GIFT_CODE_KEY = "rg";
const MAX_VALID_DAYS = 365;
// Ningún cupón pasa del 60 % (el mismo tope que los del examen y la tienda)
const MAX_COUPON_PERCENT = SETTINGS["coupon.first_percent"].max;

export type CouponFilters = { q?: string; status: Status; offset: number };

export function parseCouponFilters(query: Record<string, unknown>): CouponFilters {
  const q = query.q;
  if (q !== undefined && (typeof q !== "string" || q.length > 100)) throw new HttpError(400, "q inválido.");
  const status = query.status ?? "live";
  if (!STATUSES.includes(status as Status)) throw new HttpError(400, "status inválido.");
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(offset) || offset < 0) throw new HttpError(400, "offset inválido.");
  return { q: q?.trim() || undefined, status: status as Status, offset };
}

// El estado de cada cupón, en SQL: anulado gana a todo (uno anulado no se puede usar)
const STATUS_SQL = `CASE WHEN cv.id IS NOT NULL THEN 'void'
                         WHEN c.used_at IS NOT NULL THEN 'used'
                         WHEN c.expires_at <= now() THEN 'expired'
                         ELSE 'live' END`;

type CouponRow = {
  id: string;
  code: string;
  percent: number;
  source: "constellation" | "shop" | "manual";
  created_at: Date;
  expires_at: Date;
  used_at: Date | null;
  status: Exclude<Status, "all">;
  user_id: string;
  user_name: string;
  user_email: string;
  course: string | null;
  reason: string | null;
  voided_at: Date | null;
  void_reason: string | null;
  voided_by: string | null;
};

const FROM = `FROM coupons c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN coupon_voids cv ON cv.coupon_id = c.id
  LEFT JOIN users vu ON vu.id = cv.voided_by
  LEFT JOIN constellations k ON k.id = c.constellation_id
  LEFT JOIN products p ON p.id = k.product_id`;

export async function listCoupons(filters: CouponFilters) {
  const pattern = filters.q ? `%${filters.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : null;
  const search = "(:pattern::text IS NULL OR c.code ILIKE :pattern OR u.name ILIKE :pattern OR u.email ILIKE :pattern)";
  const rows = await sequelize.query<CouponRow>(
    `SELECT * FROM (
       SELECT c.id, c.code, c.percent, c.source, c.created_at, c.expires_at, c.used_at, ${STATUS_SQL} AS status,
              u.id AS user_id, u.name AS user_name, u.email AS user_email, p.name AS course,
              -- El motivo de un cupón de regalo está en su registro de la bitácora
              (SELECT a.after->>'reason' FROM audit_logs a
                WHERE a.action = 'coupon.issue' AND a.target_type = 'coupon' AND a.target_id = c.id::text
                ORDER BY a.id LIMIT 1) AS reason,
              cv.created_at AS voided_at, cv.reason AS void_reason, vu.name AS voided_by
       ${FROM}
       WHERE ${search}) x
     WHERE (:status = 'all' OR x.status = :status)
     ORDER BY x.created_at DESC, x.id
     LIMIT :limit OFFSET :offset`,
    {
      replacements: { pattern, status: filters.status, limit: COUPONS_PAGE_SIZE + 1, offset: filters.offset },
      type: QueryTypes.SELECT,
    }
  );
  // Cuántos hay en cada estado (con la búsqueda, para que la regla coincida con lo que se ve)
  const counts = await sequelize.query<{ status: string; count: string }>(
    `SELECT ${STATUS_SQL} AS status, count(*) AS count ${FROM} WHERE ${search} GROUP BY 1`,
    { replacements: { pattern }, type: QueryTypes.SELECT }
  );
  const countOf = (s: string) => Number(counts.find((c) => c.status === s)?.count ?? 0);

  return {
    coupons: rows.slice(0, COUPONS_PAGE_SIZE).map((r) => ({
      id: r.id,
      code: r.code,
      percent: r.percent,
      source: r.source,
      course: r.course,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      usedAt: r.used_at,
      status: r.status,
      user: { id: r.user_id, name: r.user_name, email: r.user_email },
      reason: r.reason,
      void: r.voided_at ? { at: r.voided_at, reason: r.void_reason, by: r.voided_by } : null,
    })),
    counts: {
      live: countOf("live"),
      used: countOf("used"),
      expired: countOf("expired"),
      void: countOf("void"),
      all: counts.reduce((sum, c) => sum + Number(c.count), 0),
    },
    nextOffset: rows.length > COUPONS_PAGE_SIZE ? filters.offset + COUPONS_PAGE_SIZE : null,
  };
}

// Para el diálogo de emitir: de quién es ese email, y cuántos días vale un cupón si no se cambia
export async function lookupCouponOwner(email: string) {
  const clean = email.trim().toLowerCase();
  const user = EMAIL_RE.test(clean) ? await User.findOne({ where: { email: clean } }) : null;
  const { coupons } = await loadEconomy();
  return {
    user: user ? { id: user.id, name: user.name, deleted: user.deletedAt !== null } : null,
    validDays: coupons.validDays,
    maxPercent: MAX_COUPON_PERCENT,
  };
}

export type NewCoupon = { email: string; percent: number; validDays: number; reason: string; notify: boolean };

export function parseNewCoupon(body: unknown): NewCoupon {
  const { email, percent, validDays, reason, notify } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) throw new HttpError(400, "Escribí un email válido.");
  if (!Number.isInteger(percent) || (percent as number) < 1 || (percent as number) > MAX_COUPON_PERCENT) {
    throw new HttpError(400, `El descuento va de 1 a ${MAX_COUPON_PERCENT} %.`);
  }
  if (!Number.isInteger(validDays) || (validDays as number) < 1 || (validDays as number) > MAX_VALID_DAYS) {
    throw new HttpError(400, `Vale entre 1 y ${MAX_VALID_DAYS} días.`);
  }
  return {
    email: email.trim().toLowerCase(),
    percent: percent as number,
    validDays: validDays as number,
    reason: parseReason(reason),
    notify: notify !== false,
  };
}

export function parseReason(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, "Escribí el motivo.");
  if (value.length > 300) throw new HttpError(400, "El motivo es muy largo (hasta 300 letras).");
  return value.trim();
}

// Emite un cupón de regalo (source manual). Registro coupon.issue, reversible: revertirlo lo anula
export async function issueCoupon(t: Transaction, ctx: AuditContext, input: NewCoupon) {
  const user = await User.findOne({ where: { email: input.email }, transaction: t, lock: t.LOCK.UPDATE });
  if (!user) throw new HttpError(404, "No hay nadie con ese email.");
  if (user.deletedAt) throw new HttpError(409, "Está dado de baja: restauralo primero desde Personas.");

  const now = new Date();
  const coupon = await Coupon.create(
    {
      code: await uniqueCouponCode(GIFT_CODE_KEY, t),
      percent: input.percent,
      expiresAt: new Date(now.getTime() + input.validDays * 24 * 60 * 60 * 1000),
      userId: user.id,
      source: "manual",
      constellationId: null,
      examAttemptId: null,
    },
    { transaction: t }
  );
  await writeAudit(t, {
    ...ctx,
    action: "coupon.issue",
    targetType: "coupon",
    targetId: coupon.id,
    after: {
      code: coupon.code,
      percent: coupon.percent,
      expiresAt: coupon.expiresAt.toISOString(),
      user: user.name,
      reason: input.reason,
    },
    reversible: true,
  });
  await notify(t, [user.id], {
    kind: "coupon",
    title: `Te regalamos un cupón del ${coupon.percent} %`,
    body: `${coupon.code}, vale hasta el ${dateOf(coupon.expiresAt)}. Está en Mis cupones.`,
    link: "/#mis-cupones",
    emailSent: input.notify, // el mail lo manda la ruta, después del commit
  });
  return { coupon, user };
}

async function lockCoupon(t: Transaction, id: string) {
  const coupon = await Coupon.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!coupon) throw new HttpError(404, "No existe ese cupón.");
  return coupon;
}

// Anula un cupón sin usar (de cualquier origen). Bloquea la fila del cupón: /coupons/redeem también la
// bloquea, así anular y canjear al mismo tiempo van en fila
export async function voidCoupon(t: Transaction, ctx: AuditContext, id: string, reason: string, options: ChangeOptions = {}) {
  const coupon = await lockCoupon(t, id);
  if (coupon.usedAt) throw new HttpError(409, "Ya se usó en una compra: no se puede anular.");
  if (await CouponVoid.findOne({ where: { couponId: id }, transaction: t })) throw new HttpError(409, "Ya está anulado.");

  await CouponVoid.create({ couponId: id, reason, voidedBy: ctx.actorId }, { transaction: t });
  await writeAudit(t, {
    ...ctx,
    action: options.revertsId ? "audit.revert" : "coupon.void",
    targetType: "coupon",
    targetId: id,
    before: { voided: false },
    after: { voided: true, reason },
    reversible: !options.revertsId,
    revertsId: options.revertsId,
  });
  return coupon;
}

// Deshace una anulación (solo desde la bitácora)
export async function unvoidCoupon(t: Transaction, ctx: AuditContext, id: string, revertsId: number) {
  await lockCoupon(t, id);
  const row = await CouponVoid.findOne({ where: { couponId: id }, transaction: t });
  if (!row) throw new HttpError(409, "Ese cupón no está anulado.");
  await row.destroy({ transaction: t });
  await writeAudit(t, {
    ...ctx,
    action: "audit.revert",
    targetType: "coupon",
    targetId: id,
    before: { voided: true },
    after: { voided: false },
    reversible: false,
    revertsId,
  });
}

// Para comparar al revertir: si hoy está anulado o no
export async function couponVoided(t: Transaction, id: string) {
  await lockCoupon(t, id);
  return { voided: (await CouponVoid.count({ where: { couponId: id }, transaction: t })) > 0 };
}
