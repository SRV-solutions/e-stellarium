import type { IntegrityCheck, IntegrityProblem } from "../../types";
import styles from "./IntegritySeal.module.css";

// Las tablas protegidas (las de api/src/lib/sealing.ts) y la bitácora
const TABLES = ["users", "coupons", "xp_events", "roles", "role_permissions", "audit_logs"];

type Props = {
  check: IntegrityCheck | null; // la última verificación; vacío = nunca se corrió
  checking: boolean;
  error: string | null;
  onCheck: () => void;
  onJump: (entryId: number) => void; // llevar al registro donde se corta la cadena
};

const TIME_ZONE = "America/Argentina/Buenos_Aires";

// "hoy a las 00:04", "el 12 de noviembre a las 18:20"
function when(iso: string) {
  const date = new Date(iso);
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
  const time = date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE });
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (day(date) === day(today)) return `hoy a las ${time}`;
  if (day(date) === day(yesterday)) return `ayer a las ${time}`;
  const dayMonth = date.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: TIME_ZONE });
  return `el ${dayMonth} a las ${time}`;
}

// El sello: un anillo de 7 estrellas unidas. Si algo falla, una se apaga y el anillo se abre
function Mark({ ok }: { ok: boolean }) {
  const points = Array.from({ length: 7 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 7;
    return [28 + 20 * Math.cos(angle), 28 + 20 * Math.sin(angle)];
  });
  return (
    <svg viewBox="0 0 56 56" className={ok ? styles.markOk : styles.markBad} aria-hidden="true">
      {points.map(([x1, y1], i) => {
        if (!ok && (i === 1 || i === 2)) return null;
        const [x2, y2] = points[(i + 1) % 7];
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      {points.map(([cx, cy], i) =>
        !ok && i === 2 ? (
          <circle key={i} cx={cx} cy={cy} r={3.2} className={styles.off} />
        ) : (
          <circle key={i} cx={cx} cy={cy} r={2.6} />
        )
      )}
    </svg>
  );
}

function Problem({ problem, onJump }: { problem: IntegrityProblem; onJump: (id: number) => void }) {
  if (problem.kind === "chain") {
    const id = Number(problem.rowId);
    return (
      <li>
        La cadena de la bitácora se corta en el registro{" "}
        <button type="button" className={styles.jump} onClick={() => onJump(id)}>
          #{id}
        </button>
        .
      </li>
    );
  }
  if (problem.kind === "row") {
    return (
      <li>
        Una fila de <code>{problem.table}</code> no coincide con su dígito verificador (<code>{problem.rowId.slice(0, 8)}</code>).
      </li>
    );
  }
  return (
    <li>
      A <code>{problem.table}</code> le agregaron o le borraron filas.
    </li>
  );
}

export function IntegritySeal({ check, checking, error, onCheck, onJump }: Props) {
  const ok = !check || check.ok;
  const failing = new Map<string, string>();
  for (const p of check?.problems ?? []) {
    const what = p.kind === "chain" ? "la cadena" : p.kind === "table" ? "filas" : "1 fila";
    failing.set(p.table, failing.has(p.table) && p.kind === "row" ? "varias filas" : what);
  }

  let title = "Todo coincide";
  if (!check) title = "Sin verificar";
  else if (!check.ok) title = `${check.problemCount === 1 ? "Hay 1 problema" : `Hay ${check.problemCount} problemas`}`;

  let detail = "Todavía no se corrió ninguna verificación.";
  if (checking) detail = "Verificando…";
  else if (check) detail = `Verificado ${when(check.checkedAt)}, ${check.source === "daily" ? "la diaria" : "a mano"}`;

  return (
    <aside className={`${styles.seal} ${check && !check.ok ? styles.bad : ""}`} aria-live="polite">
      <h2>Integridad</h2>
      <div className={styles.mark}>
        <Mark ok={ok} />
        <div>
          <strong className={!check ? styles.unknown : undefined}>{title}</strong>
          <span>{detail}</span>
        </div>
      </div>

      <ul className={styles.tables}>
        {TABLES.map((table) => (
          <li key={table} className={failing.has(table) ? styles.fail : undefined}>
            <span className={styles.dot} />
            <code>{table}</code>
            {failing.has(table) && <small>{failing.get(table)}</small>}
          </li>
        ))}
      </ul>

      {check && !check.ok && (
        <div className={styles.problems}>
          <p>Alguien tocó la base por fuera de la app:</p>
          <ul>
            {check.problems.map((problem, i) => (
              <Problem key={i} problem={problem} onJump={onJump} />
            ))}
          </ul>
          {check.problemCount > check.problems.length && (
            <p>Y {check.problemCount - check.problems.length} más.</p>
          )}
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.check} onClick={onCheck} disabled={checking}>
          {checking && <span className={styles.spin} aria-hidden="true" />}
          {checking ? "Verificando" : "Verificar ahora"}
        </button>
        <small>La app verifica sola una vez por día.</small>
      </div>
    </aside>
  );
}
