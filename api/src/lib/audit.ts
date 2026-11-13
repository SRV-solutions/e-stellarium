import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { hmac, stableStringify } from "./hmac.js";

// Las acciones que quedan en la bitácora
export type AuditAction =
  | "auth.login" // inicio de sesión del staff
  | "role.update" // los permisos de un rol
  | "user.role_update"
  | "user.delete" // baja lógica
  | "user.restore"
  | "audit.revert"
  | "integrity.fail";

// Quién hace el cambio y desde dónde. actorId vacío: un script o la verificación diaria
export type AuditContext = { actorId: string | null; ip: string | null };

export type AuditEntry = AuditContext & {
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reversible: boolean;
  revertsId?: number | null;
};

// Un número cualquiera: el candado de Postgres que pone en fila a los que escriben en la bitácora
const AUDIT_LOCK = 4_040_404;

type HashedFields = {
  id: number;
  createdAt: Date;
  actorId: string | null;
  ip: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  reversible: boolean;
  revertsId: number | null;
  prevHash: string | null;
};

// El hash de un registro: todos sus campos más el hash del anterior
export function auditHash(fields: HashedFields): string {
  return hmac(stableStringify(fields));
}

// Hasta el commit, nadie más escribe en la bitácora: así dos registros nunca usan el mismo anterior.
// Tomarlo dos veces en la misma transacción no hace nada.
export async function lockAudit(transaction: Transaction) {
  await sequelize.query("SELECT pg_advisory_xact_lock(:lock)", { replacements: { lock: AUDIT_LOCK }, transaction });
}

// Escribe un registro dentro de la transacción del cambio: si el cambio falla, no queda registro,
// y si el registro falla, el cambio no se aplica. Devuelve el id.
export async function writeAudit(transaction: Transaction, entry: AuditEntry): Promise<number> {
  await lockAudit(transaction);

  const [last] = await sequelize.query<{ hash: string }>("SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1", {
    type: QueryTypes.SELECT,
    transaction,
  });
  const [{ id }] = await sequelize.query<{ id: number }>(
    "SELECT nextval(pg_get_serial_sequence('audit_logs', 'id'))::int AS id",
    { type: QueryTypes.SELECT, transaction }
  );

  const fields: HashedFields = {
    id,
    createdAt: new Date(),
    actorId: entry.actorId,
    ip: entry.ip,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reversible: entry.reversible,
    revertsId: entry.revertsId ?? null,
    prevHash: last?.hash ?? null,
  };

  await sequelize.query(
    `INSERT INTO audit_logs
       (id, created_at, actor_id, ip, action, target_type, target_id, before, after, reversible, reverts_id, prev_hash, hash)
     VALUES
       (:id, :createdAt, :actorId, :ip, :action, :targetType, :targetId, :before::jsonb, :after::jsonb,
        :reversible, :revertsId, :prevHash, :hash)`,
    {
      replacements: {
        ...fields,
        before: fields.before === null ? null : JSON.stringify(fields.before),
        after: fields.after === null ? null : JSON.stringify(fields.after),
        hash: auditHash(fields),
      },
      transaction,
    }
  );
  return id;
}

// Recorre la cadena en orden y devuelve el primer registro roto (o null si está entera).
// Borrar, modificar o intercalar un registro a mano la rompe en ese punto.
export async function verifyAuditChain(): Promise<{ count: number; lastHash: string | null; brokenAt: number | null }> {
  const rows = await sequelize.query<{
    id: number;
    created_at: Date;
    actor_id: string | null;
    ip: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    before: unknown;
    after: unknown;
    reversible: boolean;
    reverts_id: number | null;
    prev_hash: string | null;
    hash: string;
  }>("SELECT * FROM audit_logs ORDER BY id", { type: QueryTypes.SELECT });

  let prevHash: string | null = null;
  for (const r of rows) {
    const expected = auditHash({
      id: r.id,
      createdAt: r.created_at,
      actorId: r.actor_id,
      ip: r.ip,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      before: r.before,
      after: r.after,
      reversible: r.reversible,
      revertsId: r.reverts_id,
      prevHash: r.prev_hash,
    });
    if (r.prev_hash !== prevHash || r.hash !== expected) {
      return { count: rows.length, lastHash: rows.at(-1)!.hash, brokenAt: r.id };
    }
    prevHash = r.hash;
  }
  return { count: rows.length, lastHash: prevHash, brokenAt: null };
}
