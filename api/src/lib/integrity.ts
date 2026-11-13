import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { verifyAuditChain, writeAudit } from "./audit.js";
import { sendMail } from "./mailer.js";
import { integrityFailEmail } from "./email.js";
import { argentinaDay } from "../games/streak.js";
import { PROTECTED_TABLES, ZERO_DVV, auditDvv, dvhOf, dvvPart, writeDvhs, xorHex, type ProtectedTable } from "./sealing.js";

// La verificación de integridad: DVH de cada fila, DVV de cada tabla y la cadena de la bitácora.
// Detecta lo que se cambió en la base sin pasar por la API.

export type IntegrityProblem =
  | { kind: "row"; table: ProtectedTable; rowId: string } // la fila no coincide con su dvh (o no tiene)
  | { kind: "table"; table: ProtectedTable | "audit_logs" } // el DVV no coincide: agregaron o borraron filas
  | { kind: "chain"; table: "audit_logs"; rowId: string }; // la cadena se rompe en ese registro

const MAX_STORED_PROBLEMS = 100;

async function rowsOf(table: ProtectedTable, t: Transaction) {
  return sequelize.query<{ id: string; dvh: string | null; data: string }>(
    `SELECT id::text AS id, dvh, (to_jsonb(x) - 'dvh')::text AS data FROM ${table} x ORDER BY id`,
    { type: QueryTypes.SELECT, transaction: t }
  );
}

// Recalcula todos los dígitos desde cero, dando por buenos los datos de hoy. Solo para la primera vez
// (después de desplegar el bloque 4) o después de revisar una alerta: `npm run seal-integrity`.
export async function sealAll() {
  await sequelize.transaction(async (t) => {
    await sequelize.query("SELECT set_config('integrity.sealing', 'on', true)", { transaction: t });
    for (const table of PROTECTED_TABLES) {
      const rows = await rowsOf(table, t);
      let dvv = ZERO_DVV;
      const sealed = rows.map((r) => {
        const dvh = dvhOf(table, r.data);
        dvv = xorHex(dvv, dvvPart(dvh));
        return { id: r.id, dvh };
      });
      await writeDvhs(sequelize, t, table, sealed.filter((s, i) => s.dvh !== rows[i].dvh));
      await sequelize.query("UPDATE integrity SET dvv = :dvv WHERE table_name = :table", {
        replacements: { dvv, table },
        transaction: t,
      });
    }
    const [audit] = await sequelize.query<{ count: number; last: string | null }>(
      "SELECT count(*)::int AS count, (SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1) AS last FROM audit_logs",
      { type: QueryTypes.SELECT, transaction: t }
    );
    await sequelize.query("UPDATE integrity SET dvv = :dvv WHERE table_name = 'audit_logs'", {
      replacements: { dvv: auditDvv(audit.count, audit.last) },
      transaction: t,
    });
    await sequelize.query("DELETE FROM integrity_pending", { transaction: t });
    await sequelize.query("SELECT set_config('integrity.sealing', 'off', true)", { transaction: t });
  });
}

// Solo lee. En REPEATABLE READ, todas las consultas ven la base en el mismo instante
export async function checkIntegrity(): Promise<IntegrityProblem[]> {
  return sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }, async (t) => {
    const problems: IntegrityProblem[] = [];
    const stored = await sequelize.query<{ table_name: string; dvv: string }>("SELECT table_name, dvv FROM integrity", {
      type: QueryTypes.SELECT,
      transaction: t,
    });
    const dvvOf = (table: string) => stored.find((s) => s.table_name === table)?.dvv;

    for (const table of PROTECTED_TABLES) {
      let dvv = ZERO_DVV;
      for (const r of await rowsOf(table, t)) {
        if (r.dvh !== dvhOf(table, r.data)) problems.push({ kind: "row", table, rowId: r.id });
        if (r.dvh) dvv = xorHex(dvv, dvvPart(r.dvh));
      }
      if (dvv !== dvvOf(table)) problems.push({ kind: "table", table });
    }

    const chain = await verifyAuditChain(t);
    if (chain.brokenAt !== null) problems.push({ kind: "chain", table: "audit_logs", rowId: String(chain.brokenAt) });
    if (auditDvv(chain.count, chain.lastHash) !== dvvOf("audit_logs")) problems.push({ kind: "table", table: "audit_logs" });

    return problems;
  });
}

export type IntegrityCheck = {
  id: number;
  checkedAt: Date;
  source: "manual" | "daily";
  ok: boolean;
  problemCount: number;
  problems: IntegrityProblem[];
};

type CheckRow = {
  id: number;
  checked_at: Date;
  source: "manual" | "daily";
  ok: boolean;
  problem_count: number;
  problems: IntegrityProblem[];
};

function present(row: CheckRow): IntegrityCheck {
  return {
    id: row.id,
    checkedAt: row.checked_at,
    source: row.source,
    ok: row.ok,
    problemCount: row.problem_count,
    problems: row.problems,
  };
}

export async function lastCheck(): Promise<IntegrityCheck | null> {
  const [row] = await sequelize.query<CheckRow>("SELECT * FROM integrity_checks ORDER BY id DESC LIMIT 1", {
    type: QueryTypes.SELECT,
  });
  return row ? present(row) : null;
}

// Corre la verificación y guarda el resultado. Si falla: queda en la bitácora (integrity.fail) y,
// después del commit, se avisa por mail a los super admins. La diaria devuelve null si ese día ya corrió.
export async function runIntegrityCheck(
  source: "manual" | "daily",
  by: { actorId: string | null; ip: string | null } = { actorId: null, ip: null },
  now = new Date()
): Promise<IntegrityCheck | null> {
  const problems = await checkIntegrity();

  const check = await sequelize.transaction(async (t) => {
    const [row] = await sequelize.query<CheckRow>(
      `INSERT INTO integrity_checks (checked_at, source, daily_day, ok, problem_count, problems, checked_by)
       VALUES (:now, :source, :dailyDay, :ok, :count, :problems::jsonb, :checkedBy)
       ON CONFLICT (daily_day) DO NOTHING
       RETURNING *`,
      {
        replacements: {
          now,
          source,
          dailyDay: source === "daily" ? argentinaDay(now) : null,
          ok: problems.length === 0,
          count: problems.length,
          problems: JSON.stringify(problems.slice(0, MAX_STORED_PROBLEMS)),
          checkedBy: by.actorId,
        },
        type: QueryTypes.SELECT,
        transaction: t,
      }
    );
    if (!row) return null; // otra instancia ya corrió la de hoy

    if (problems.length > 0) {
      await writeAudit(t, {
        ...by,
        action: "integrity.fail",
        targetType: "integrity_check",
        targetId: String(row.id),
        after: { problemCount: problems.length, problems: problems.slice(0, 10) },
        reversible: false,
      });
    }
    return present(row);
  });

  if (check && !check.ok) {
    try {
      const supers = await sequelize.query<{ email: string }>(
        `SELECT u.email FROM users u JOIN roles r ON r.id = u.role_id
          WHERE r.key = 'super_admin' AND u.deleted_at IS NULL`,
        { type: QueryTypes.SELECT }
      );
      for (const { email } of supers) await sendMail({ to: email, ...integrityFailEmail(check.problems) });
    } catch (err) {
      console.error("No se pudo avisar la falla de integridad", err);
    }
  }
  return check;
}

// La verificación diaria, al primer pedido de cada día de Argentina. No hace esperar al pedido.
let dailyRanOn: string | null = null;

export function runDailyCheckIfDue(now = new Date()) {
  const day = argentinaDay(now);
  if (dailyRanOn === day) return;
  dailyRanOn = day;
  runIntegrityCheck("daily", undefined, now).catch((err) => {
    dailyRanOn = null; // que lo intente el próximo pedido
    console.error("Falló la verificación diaria de integridad", err);
  });
}
