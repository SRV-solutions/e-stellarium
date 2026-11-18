import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useCoupons } from "../../../hooks/useCoupons";
import type { CouponSummary } from "../../../types";
import { Scratch } from "./Scratch";
import styles from "./Coupons.module.css";

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_DAYS = 60; // lo que dura un cupón (en la API, COUPON_VALID_DAYS)
const SOON_DAYS = 7; // desde acá, el vencimiento se marca en coral
const SHOP_HREF = "https://wearesrv.com";

// Los códigos que ya raspó, guardados en este navegador: una tarjeta raspada queda raspada
const SCRATCHED_KEY = "estl-scratched";

function readScratched(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SCRATCHED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveScratched(code: string) {
  try {
    localStorage.setItem(SCRATCHED_KEY, JSON.stringify([...new Set([...readScratched(), code])]));
  } catch {
    // Sin almacenamiento (navegación privada, por ejemplo): se vuelve a tapar al recargar, nada más
  }
}

type State = "active" | "used" | "expired" | "voided";

function stateOf(coupon: CouponSummary, now: number): State {
  if (coupon.voided) return "voided";
  if (coupon.usedAt) return "used";
  return new Date(coupon.expiresAt).getTime() <= now ? "expired" : "active";
}

function dayMonth(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long" });
}

type Group = { key: string; coupons: CouponSummary[] };

// Los cupones que se pueden usar, juntando los iguales (mismo porcentaje y mismo origen).
// Adentro de cada grupo, el que vence antes va primero; los grupos, de más descuento a menos
function groupActive(coupons: CouponSummary[], now: number): Group[] {
  const map = new Map<string, CouponSummary[]>();
  for (const c of coupons.filter((c) => stateOf(c, now) === "active").sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))) {
    const key = `${c.percent}|${c.course?.key ?? "tienda"}`;
    map.set(key, [...(map.get(key) ?? []), c]);
  }
  return [...map].map(([key, list]) => ({ key, coupons: list })).sort(
    (a, b) => b.coupons[0]!.percent - a.coupons[0]!.percent || a.coupons[0]!.expiresAt.localeCompare(b.coupons[0]!.expiresAt),
  );
}

// Los usados, vencidos y anulados, lo último que pasó primero
function spentOf(coupons: CouponSummary[], now: number) {
  return coupons.filter((c) => stateOf(c, now) !== "active").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// La estrella de examen, la misma del mapa: encendida en los cupones, apagada en el lugar vacío
function ExamStar({ lit }: { lit: boolean }) {
  return (
    <svg viewBox="0 0 38 38" aria-hidden="true">
      {lit && <circle className={styles.halo} cx="19" cy="19" r="19" />}
      {Array.from({ length: 8 }, (_, k) => {
        const a = (k * Math.PI) / 4;
        const outer = k % 2 ? 13 : 18;
        return (
          <line
            key={k}
            className={styles.ray}
            x1={19 + Math.cos(a) * 8}
            y1={19 + Math.sin(a) * 8}
            x2={19 + Math.cos(a) * outer}
            y2={19 + Math.sin(a) * outer}
          />
        );
      })}
      <circle className={styles.core} cx="19" cy="19" r={lit ? 4 : 6} />
    </svg>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const COPY = "M8 8h12v12H8zM16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3";
const CHECK = "M5 12l5 5 9-10";
const ARROW = "M7 17L17 7M9 7h8v8";
const LOCK = "M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3";
const CHEVRON = "M6 9l6 6 6-6";

function daysLeftOf(coupon: CouponSummary, now: number) {
  return Math.max(0, Math.ceil((new Date(coupon.expiresAt).getTime() - now) / DAY_MS));
}

function fromText(coupon: CouponSummary, plural: boolean) {
  // Los de la tienda no vienen de un curso
  return coupon.course ? (
    <>
      Por aprobar el examen de <b>{coupon.course.name}</b>
    </>
  ) : (
    <>
      {plural ? "Canjeados" : "Canjeado"} en la <b>tienda</b>
    </>
  );
}

type CodeProps = { coupon: CouponSummary; scratched: boolean; onScratched: (code: string) => void; className?: string };

// El código, con su botón de copiar y la raspadita encima (hasta que se raspa)
function CodeBox({ coupon, scratched, onScratched, className }: CodeProps) {
  const [copied, setCopied] = useState(false);
  const reveal = useCallback(() => onScratched(coupon.code), [onScratched, coupon.code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
    } catch {
      // Si el navegador no deja copiar, el código sigue a la vista
    }
  }

  return (
    <div className={`${styles.code} ${className ?? ""}`}>
      <code>{coupon.code}</code>
      <button
        type="button"
        className={`${styles.copy} ${copied ? styles.copied : ""}`}
        onClick={copy}
        aria-label={copied ? "Código copiado" : "Copiar el código"}
      >
        <Icon d={copied ? CHECK : COPY} />
        <span className={styles.copyLabel}>{copied ? "Copiado" : "Copiar"}</span>
      </button>
      {!scratched && <Scratch onReveal={reveal} />}
    </div>
  );
}

type TicketProps = {
  // Un cupón suelto, o varios iguales que se juntan en una pila
  coupons: CouponSummary[];
  now: number;
  index: number;
  scratched: string[];
  onScratched: (code: string) => void;
  onChoose: () => void;
};

function Ticket({ coupons, now, index, scratched, onScratched, onChoose }: TicketProps) {
  const first = coupons[0]!;
  const last = coupons[coupons.length - 1]!;
  const pile = coupons.length > 1;
  const daysLeft = daysLeftOf(first, now);
  const soon = daysLeft <= SOON_DAYS;
  const days = daysLeft === 1 ? "1 día" : `${daysLeft} días`;

  return (
    <li className={`${pile ? styles.pile : ""}`}>
      <div className={`${styles.ticket} ${soon ? styles.soon : ""}`} style={{ "--i": index } as CSSProperties}>
        <span className={styles.perf} aria-hidden="true" />
        <div className={styles.stub}>
          <ExamStar lit />
          <span className={styles.pct}>
            {first.percent}
            <small> %</small>
          </span>
          {pile ? <span className={styles.times}>× {coupons.length}</span> : <span className={styles.off}>de descuento</span>}
        </div>

        <div className={styles.body}>
          <p className={styles.from}>{fromText(first, pile)}</p>

          {pile ? (
            <p className={styles.range}>
              Para {coupons.length} compras distintas. El primero vence{" "}
              {soon ? (
                <>
                  en <b>{days}</b>
                </>
              ) : (
                <>
                  el <b>{dayMonth(first.expiresAt)}</b>
                </>
              )}
              {last.expiresAt !== first.expiresAt && <>, el último el {dayMonth(last.expiresAt)}</>}.
            </p>
          ) : (
            <CodeBox coupon={first} scratched={scratched.includes(first.code)} onScratched={onScratched} />
          )}

          <div className={styles.foot}>
            <div className={styles.life}>
              {!pile && (
                <p>
                  {soon ? (
                    <>
                      Vence en <b>{days}</b>, el {dayMonth(first.expiresAt)}
                    </>
                  ) : (
                    <>
                      Vence el <b>{dayMonth(first.expiresAt)}</b>
                    </>
                  )}
                </p>
              )}
              <div className={styles.bar} aria-hidden="true">
                <i style={{ width: `${Math.min(100, (daysLeft / VALID_DAYS) * 100)}%` }} />
              </div>
            </div>
            {pile ? (
              <button type="button" className={styles.more} onClick={onChoose}>
                Elegir cuál usar
              </button>
            ) : (
              <a className={styles.use} href={SHOP_HREF} target="_blank" rel="noreferrer">
                Usarlo
                <Icon d={ARROW} />
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

type DialogProps = {
  group: Group | null;
  now: number;
  scratched: string[];
  onScratched: (code: string) => void;
  onClose: () => void;
};

// El modal de una pila: cada cupón, individual, con su raspadita y su "Usarlo".
// Usa <dialog> con showModal(), como ConfirmDialog: fondo oscuro, foco adentro y Escape
function ChooseDialog({ group, now, scratched, onScratched, onClose }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // El contenido se monta recién con el modal abierto: la raspadita mide su franja al pintarse,
  // y dentro de un <dialog> cerrado mediría cero
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (group && !el.open) el.showModal();
    if (!group && el.open) el.close();
    setVisible(group !== null);
  }, [group]);

  const g = visible ? group : null;
  const first = g?.coupons[0];
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      {g && first && (
        <>
          <header className={styles.dialogHead}>
            <div className={styles.big}>
              <ExamStar lit />
              <span className={styles.pct}>
                {first.percent}
                <small> %</small>
              </span>
            </div>
            <div>
              <h2 id={titleId}>
                {g.coupons.length} cupones del {first.percent} %
              </h2>
              <p>
                {first.course ? `Por aprobar el examen de ${first.course.name}` : "Canjeados en la tienda"}. Elegí cuál usar: cada uno
                sirve para una sola compra.
              </p>
            </div>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar" autoFocus>
              ×
            </button>
          </header>
          <ul className={styles.rows}>
            {g.coupons.map((c) => {
              const daysLeft = daysLeftOf(c, now);
              const soon = daysLeft <= SOON_DAYS;
              const date = new Date(c.expiresAt);
              return (
                <li key={c.code} className={`${styles.row} ${soon ? styles.soon : ""}`}>
                  <div className={styles.date}>
                    <small>{soon ? (daysLeft === 1 ? "En 1 día" : `En ${daysLeft} días`) : "Vence"}</small>
                    <b>{date.getDate()}</b>
                    <span>{date.toLocaleDateString("es-AR", { month: "short" }).replace(".", "")}</span>
                  </div>
                  <CodeBox coupon={c} scratched={scratched.includes(c.code)} onScratched={onScratched} className={styles.rowCode} />
                  <a className={styles.use} href={SHOP_HREF} target="_blank" rel="noreferrer">
                    Usarlo
                    <Icon d={ARROW} />
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </dialog>
  );
}

// Los que ya no sirven, plegados en una línea cada uno
function Spent({ coupons, now }: { coupons: CouponSummary[]; now: number }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const LABEL = { used: "Usado", expired: "Vencido", voided: "Anulado", active: "" };
  return (
    <div className={styles.spentBox}>
      <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        Ya usados o vencidos ({coupons.length})
        <Icon d={CHEVRON} />
      </button>
      {open && (
        <ul id={listId} className={styles.spentList}>
          {coupons.map((c) => {
            const st = stateOf(c, now);
            return (
              <li key={c.code}>
                <b>{c.percent} %</b>
                <span>
                  {st === "used" && `Lo usaste el ${dayMonth(c.usedAt!)}`}
                  {st === "expired" && `Venció el ${dayMonth(c.expiresAt)}`}
                  {st === "voided" && "Lo anulamos: ya no sirve"} · <code>{c.code}</code>
                </span>
                <em className={st === "expired" ? styles.expiredTag : ""}>{LABEL[st]}</em>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// "Mis cupones" del inicio: los activos juntando los iguales, y los gastados plegados
export function Coupons() {
  const state = useCoupons();
  const [scratched, setScratched] = useState(readScratched);
  // La hora con la que se calcula qué venció: la de cuando se abrió la página
  const [now] = useState(() => Date.now());
  // La pila abierta en el modal (su clave), si hay alguna
  const [chosen, setChosen] = useState<string | null>(null);

  const onScratched = useCallback((code: string) => {
    saveScratched(code);
    setScratched((previous) => [...previous, code]);
  }, []);

  if (state.status === "loading") {
    return (
      <p className={styles.muted} role="status">
        Cargando tus cupones...
      </p>
    );
  }
  if (state.status === "error") {
    return <p className={styles.muted}>No pudimos cargar tus cupones. Probá recargando la página.</p>;
  }

  if (state.coupons.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.stub}>
          <ExamStar lit={false} />
          <span className={styles.pct}>
            60<small> %</small>
          </span>
          <span className={styles.off}>de descuento</span>
        </div>
        <div className={styles.body}>
          <strong>Tu primer cupón te espera</strong>
          <p>Aprobá el examen de una constelación y ganás un 60 % para tu próximo curso. Los siguientes dan 40 %.</p>
        </div>
      </div>
    );
  }

  const groups = groupActive(state.coupons, now);
  const spent = spentOf(state.coupons, now);
  const usable = groups.reduce((n, g) => n + g.coupons.length, 0);

  return (
    <>
      <p className={styles.lead}>
        {usable > 0 && <span className={styles.count}>{usable === 1 ? "1 para usar" : `${usable} para usar`}</span>}
        Para tu próximo curso en wearesrv.com. Cada cupón sirve para una sola compra.
      </p>
      {/* El brillo dorado de la estrella de cada talón, definido una sola vez */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <radialGradient id="coupon-gold">
            <stop offset="0" stopColor="#fff2d6" stopOpacity=".75" />
            <stop offset=".45" stopColor="#ff9900" stopOpacity=".3" />
            <stop offset="1" stopColor="#ff9900" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      {groups.length > 0 && (
        <ul className={styles.list}>
          {groups.map((g, i) => (
            <Ticket
              key={g.key}
              coupons={g.coupons}
              now={now}
              index={i}
              scratched={scratched}
              onScratched={onScratched}
              onChoose={() => setChosen(g.key)}
            />
          ))}
        </ul>
      )}
      {spent.length > 0 && <Spent coupons={spent} now={now} />}
      <ChooseDialog
        group={groups.find((g) => g.key === chosen) ?? null}
        now={now}
        scratched={scratched}
        onScratched={onScratched}
        onClose={() => setChosen(null)}
      />
      <p className={styles.warn}>
        <Icon d={LOCK} />
        <span>
          <b>No compartas tus códigos.</b> No tienen nombre: quien use uno primero se queda con el descuento.
        </span>
      </p>
    </>
  );
}
