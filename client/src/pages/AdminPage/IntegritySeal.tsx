import type { IntegrityCheck, IntegrityProblem } from "../../types";
import styles from "./IntegritySeal.module.css";

// Las tablas protegidas (las de api/src/lib/sealing.ts) y la bitácora
const TABLES = ["users", "coupons", "xp_events", "roles", "role_permissions", "settings", "shop_items", "audit_logs"];

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

// Los problemas, agrupados: una línea por tabla (con cuántas filas no coinciden) y una por cada corte de la cadena.
// Cientos de filas sueltas llenaban la pantalla sin decir nada más que "esta tabla está mal"
function Problems({ problems, onJump }: { problems: IntegrityProblem[]; onJump: (id: number) => void }) {
  const rows = new Map<string, number>();
  const tables = new Set<string>();
  const chains: number[] = [];
  for (const p of problems) {
    if (p.kind === "row") rows.set(p.table, (rows.get(p.table) ?? 0) + 1);
    else if (p.kind === "table") tables.add(p.table);
    else chains.push(Number(p.rowId));
  }
  return (
    <ul>
      {[...rows].map(([table, count]) => (
        <li key={`row-${table}`}>
          <code>{table}</code>: {count === 1 ? "1 fila no coincide" : `${count} filas no coinciden`} con su dígito verificador.
        </li>
      ))}
      {[...tables].map((table) => (
        <li key={`table-${table}`}>
          A <code>{table}</code> le agregaron o le borraron filas.
        </li>
      ))}
      {chains.slice(0, 5).map((id) => (
        <li key={`chain-${id}`}>
          La cadena de la bitácora se corta en el registro{" "}
          <button type="button" className={styles.jump} onClick={() => onJump(id)}>
            #{id}
          </button>
          .
        </li>
      ))}
      {chains.length > 5 && <li>Y {chains.length - 5} cortes más en la bitácora.</li>}
    </ul>
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
          <Problems problems={check.problems} onJump={onJump} />
          {check.problemCount > check.problems.length && (
            <p>
              Se guardan los primeros {check.problems.length}: en total son {check.problemCount}, así que las cuentas de arriba pueden quedar cortas.
            </p>
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
