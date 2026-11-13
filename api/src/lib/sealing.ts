import { QueryTypes, type Sequelize, type Transaction } from "sequelize";
import { hmac } from "./hmac.js";

// Dígito verificador horizontal (DVH) y vertical (DVV) de las tablas protegidas.
//
// - DVH de una fila = HMAC de la fila tal como la escribe Postgres en JSON (to_jsonb, sin la columna dvh),
//   con el nombre de la tabla adelante. Sin la clave secreta no se puede recalcular.
// - DVV de una tabla = XOR de un HMAC de cada DVH. Se actualiza sin releer la tabla: se saca la parte
//   del DVH viejo y se suma la del nuevo (con XOR, sacar y sumar es la misma operación). Como cada parte
//   es un HMAC, quien borra una fila a mano no puede descontarla del DVV.
//
// Nadie llama a esto a mano: un trigger anota cada fila escrita en integrity_pending, y db.ts llama a
// sealTransaction justo antes del commit de cada sequelize.transaction(...). Por eso toda escritura en una
// tabla protegida tiene que ir dentro de una transacción.

export const PROTECTED_TABLES = ["coupons", "role_permissions", "roles", "users", "xp_events"] as const;
export type ProtectedTable = (typeof PROTECTED_TABLES)[number];

export const ID_TYPES: Record<ProtectedTable, string> = {
  coupons: "uuid",
  role_permissions: "uuid",
  roles: "smallint",
  users: "uuid",
  xp_events: "uuid",
};

export const ZERO_DVV = "0".repeat(64);

// data: el texto de to_jsonb(fila) - 'dvh' (Postgres escribe siempre las claves en el mismo orden)
export function dvhOf(table: string, data: string): string {
  return hmac(`row:${table}:${data}`);
}

// Lo que aporta una fila al DVV
export function dvvPart(dvh: string): string {
  return hmac(`dvv:${dvh}`);
}

export function xorHex(a: string, b: string): string {
  const out = Buffer.from(a, "hex");
  const other = Buffer.from(b, "hex");
  for (let i = 0; i < out.length; i++) out[i] ^= other[i];
  return out.toString("hex");
}

// El DVV de la bitácora: cuántos registros hay y el hash del último. La cadena sola no nota que
// borren el último registro; esto sí.
export function auditDvv(count: number, lastHash: string | null): string {
  return hmac(`audit:${count}:${lastHash ?? ""}`);
}

// Escribe varios dvh de una vez, sin que el trigger lo anote
export async function writeDvhs(
  sequelize: Sequelize,
  t: Transaction,
  table: ProtectedTable,
  rows: { id: string; dvh: string }[]
) {
  if (rows.length === 0) return;
  await sequelize.query(
    `UPDATE ${table} AS x SET dvh = v.dvh
       FROM unnest(ARRAY[:ids]::text[], ARRAY[:dvhs]::text[]) AS v(id, dvh)
      WHERE x.id = v.id::${ID_TYPES[table]}`,
    { replacements: { ids: rows.map((r) => r.id), dvhs: rows.map((r) => r.dvh) }, transaction: t }
  );
}

type Pending = { table_name: ProtectedTable; row_id: string; old_dvh: string | null; old_data: string | null };

// Sella lo que escribió esta transacción. Si la versión anterior de una fila ya no coincidía con su dvh
// (alguien la tocó a mano), no la sella: queda marcada para que la verificación la muestre.
export async function sealTransaction(sequelize: Sequelize, t: Transaction) {
  const [{ xid }] = await sequelize.query<{ xid: string | null }>(
    "SELECT pg_current_xact_id_if_assigned()::text AS xid",
    { type: QueryTypes.SELECT, transaction: t }
  );
  if (!xid) return; // no escribió nada

  const pending = await sequelize.query<Pending>(
    `SELECT table_name, row_id, old_dvh, old_data::text AS old_data
       FROM integrity_pending WHERE xid = pg_current_xact_id() ORDER BY id`,
    { type: QueryTypes.SELECT, transaction: t }
  );
  if (pending.length === 0) return;

  await sequelize.query("SELECT set_config('integrity.sealing', 'on', true)", { transaction: t });

  // La primera anotación de cada fila dice cómo estaba antes de esta transacción
  const firsts = new Map<string, Pending>();
  for (const p of pending) {
    const key = `${p.table_name}:${p.row_id}`;
    if (!firsts.has(key)) firsts.set(key, p);
  }

  // Siempre en el mismo orden (alfabético), así dos transacciones nunca se esperan en cruz
  const tables = PROTECTED_TABLES.filter((table) => pending.some((p) => p.table_name === table));
  const dvvs = await sequelize.query<{ table_name: ProtectedTable; dvv: string }>(
    "SELECT table_name, dvv FROM integrity WHERE table_name IN (:tables) ORDER BY table_name FOR UPDATE",
    { replacements: { tables }, type: QueryTypes.SELECT, transaction: t }
  );

  for (const table of tables) {
    const entries = [...firsts.values()].filter((p) => p.table_name === table);
    const valid = entries.filter(
      (p) => p.old_data === null || (p.old_dvh !== null && p.old_dvh === dvhOf(table, p.old_data))
    );
    if (valid.length === 0) continue;

    const current = await sequelize.query<{ id: string; data: string }>(
      `SELECT id::text AS id, (to_jsonb(x) - 'dvh')::text AS data FROM ${table} x
        WHERE x.id IN (SELECT unnest(ARRAY[:ids]::text[])::${ID_TYPES[table]})`,
      { replacements: { ids: valid.map((p) => p.row_id) }, type: QueryTypes.SELECT, transaction: t }
    );

    let dvv = dvvs.find((d) => d.table_name === table)?.dvv ?? ZERO_DVV;
    const sealed: { id: string; dvh: string }[] = [];
    for (const p of valid) {
      if (p.old_dvh) dvv = xorHex(dvv, dvvPart(p.old_dvh)); // sale la versión vieja
      const row = current.find((r) => r.id === p.row_id);
      if (!row) continue; // la borraron
      const dvh = dvhOf(table, row.data);
      sealed.push({ id: row.id, dvh });
      dvv = xorHex(dvv, dvvPart(dvh)); // entra la nueva
    }

    await writeDvhs(sequelize, t, table, sealed);
    await sequelize.query("UPDATE integrity SET dvv = :dvv WHERE table_name = :table", {
      replacements: { dvv, table },
      transaction: t,
    });
  }

  await sequelize.query("DELETE FROM integrity_pending WHERE xid = pg_current_xact_id()", { transaction: t });
  await sequelize.query("SELECT set_config('integrity.sealing', 'off', true)", { transaction: t });
}
