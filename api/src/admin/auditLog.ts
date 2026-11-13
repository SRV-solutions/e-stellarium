import { QueryTypes } from "sequelize";
import { sequelize } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { isUuid } from "../lib/uuid.js";

export const AUDIT_PAGE_SIZE = 50;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type AuditFilters = {
  actor?: string; // id del que hizo la acción
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string; // "2026-11-12", día de Argentina, incluido
  to?: string; // ídem, incluido
  before?: number; // para pedir la página siguiente: los registros con id menor
};

function text(value: unknown, name: string): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length > 64) throw new HttpError(400, `${name} inválido.`);
  return value;
}

export function parseAuditFilters(query: Record<string, unknown>): AuditFilters {
  const filters: AuditFilters = {
    actor: text(query.actor, "actor"),
    action: text(query.action, "action"),
    targetType: text(query.targetType, "targetType"),
    targetId: text(query.targetId, "targetId"),
    from: text(query.from, "from"),
    to: text(query.to, "to"),
  };
  if (filters.actor && !isUuid(filters.actor)) throw new HttpError(400, "actor inválido.");
  for (const day of [filters.from, filters.to]) {
    if (day && (!DAY_RE.test(day) || Number.isNaN(Date.parse(day)))) {
      throw new HttpError(400, "Las fechas van como 2026-11-12.");
    }
  }
  if (query.before !== undefined) {
    const before = Number(query.before);
    if (!Number.isInteger(before) || before < 1) throw new HttpError(400, "before inválido.");
    filters.before = before;
  }
  return filters;
}

// Los registros de la bitácora, del más nuevo al más viejo. "revertedBy" se deduce del registro que
// lo revierte (la bitácora no se edita). canRevert: se puede revertir y nadie lo revirtió todavía.
export async function listAudit(filters: AuditFilters) {
  // Argentina está siempre en UTC-3 (sin horario de verano)
  const fromAt = filters.from ? `${filters.from}T00:00:00-03:00` : null;
  const toAt = filters.to ? `${filters.to}T00:00:00-03:00` : null;

  const rows = await sequelize.query<{
    id: number;
    created_at: Date;
    actor_id: string | null;
    actor_name: string | null;
    actor_email: string | null;
    ip: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    before: unknown;
    after: unknown;
    reversible: boolean;
    reverts_id: number | null;
    reverted_by: number | null;
  }>(
    `SELECT a.id, a.created_at, a.actor_id, u.name AS actor_name, u.email AS actor_email, a.ip, a.action,
            a.target_type, a.target_id, a.before, a.after, a.reversible, a.reverts_id, r.id AS reverted_by
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       LEFT JOIN audit_logs r ON r.reverts_id = a.id
      WHERE (:actor::uuid IS NULL OR a.actor_id = :actor::uuid)
        AND (:action::text IS NULL OR a.action = :action)
        AND (:targetType::text IS NULL OR a.target_type = :targetType)
        AND (:targetId::text IS NULL OR a.target_id = :targetId)
        AND (:fromAt::timestamptz IS NULL OR a.created_at >= :fromAt::timestamptz)
        AND (:toAt::timestamptz IS NULL OR a.created_at < :toAt::timestamptz + interval '1 day')
        AND (:before::int IS NULL OR a.id < :before::int)
      ORDER BY a.id DESC
      LIMIT :limit`,
    {
      replacements: {
        actor: filters.actor ?? null,
        action: filters.action ?? null,
        targetType: filters.targetType ?? null,
        targetId: filters.targetId ?? null,
        fromAt,
        toAt,
        before: filters.before ?? null,
        limit: AUDIT_PAGE_SIZE,
      },
      type: QueryTypes.SELECT,
    }
  );

  return {
    entries: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      actor: r.actor_id ? { id: r.actor_id, name: r.actor_name, email: r.actor_email } : null,
      ip: r.ip,
      action: r.action,
      target: r.target_type ? { type: r.target_type, id: r.target_id } : null,
      before: r.before,
      after: r.after,
      reversible: r.reversible,
      revertsId: r.reverts_id,
      revertedBy: r.reverted_by,
      canRevert: r.reversible && r.reverted_by === null,
    })),
    // Hay más si vino la página llena: se piden con ?before=<este id>
    nextBefore: rows.length === AUDIT_PAGE_SIZE ? rows.at(-1)!.id : null,
  };
}
