import { useCallback, useState, type CSSProperties } from "react";
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

type State = "active" | "used" | "expired";

function stateOf(coupon: CouponSummary, now: number): State {
  if (coupon.usedAt) return "used";
  return new Date(coupon.expiresAt).getTime() <= now ? "expired" : "active";
}

function dayMonth(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long" });
}

// Los que se pueden usar primero (el que vence antes, arriba); después los usados y vencidos
function sorted(coupons: CouponSummary[], now: number) {
  const active = coupons
    .filter((c) => stateOf(c, now) === "active")
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const spent = coupons.filter((c) => stateOf(c, now) !== "active");
  return [...active, ...spent];
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

type TicketProps = {
  coupon: CouponSummary;
  state: State;
  now: number;
  index: number;
  scratched: boolean;
  onScratched: (code: string) => void;
};

function Ticket({ coupon, state, now, index, scratched, onScratched }: TicketProps) {
  const [copied, setCopied] = useState(false);
  const reveal = useCallback(() => onScratched(coupon.code), [onScratched, coupon.code]);

  const active = state === "active";
  const daysLeft = Math.max(0, Math.ceil((new Date(coupon.expiresAt).getTime() - now) / DAY_MS));
  const soon = active && daysLeft <= SOON_DAYS;

  async function copy() {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
    } catch {
      // Si el navegador no deja copiar, el código sigue a la vista
    }
  }

  return (
    <li
      className={`${styles.ticket} ${active ? "" : styles.spent} ${state === "expired" ? styles.expired : ""} ${soon ? styles.soon : ""}`}
      style={{ "--i": index } as CSSProperties}
    >
      <span className={styles.perf} aria-hidden="true" />
      <div className={styles.stub}>
        <ExamStar lit />
        <span className={styles.pct}>
          {coupon.percent}
          <small> %</small>
        </span>
        <span className={styles.off}>de descuento</span>
      </div>

      <div className={styles.body}>
        <p className={styles.from}>
          Por aprobar el examen de <b>{coupon.course.name}</b>
        </p>

        <div className={styles.code}>
          <code>{coupon.code}</code>
          {active && (
            <button type="button" className={`${styles.copy} ${copied ? styles.copied : ""}`} onClick={copy}>
              <Icon d={copied ? CHECK : COPY} />
              {copied ? "Copiado" : "Copiar"}
            </button>
          )}
          {active && !scratched && <Scratch onReveal={reveal} />}
        </div>

        <div className={styles.foot}>
          <div className={styles.life}>
            {state === "active" && (
              <>
                <p>
                  {soon ? (
                    <>
                      Vence en <b>{daysLeft === 1 ? "1 día" : `${daysLeft} días`}</b>, el {dayMonth(coupon.expiresAt)}
                    </>
                  ) : (
                    <>
                      Vence el <b>{dayMonth(coupon.expiresAt)}</b>
                    </>
                  )}
                </p>
                <div className={styles.bar} aria-hidden="true">
                  <i style={{ width: `${Math.min(100, (daysLeft / VALID_DAYS) * 100)}%` }} />
                </div>
              </>
            )}
            {state === "used" && <p>Lo usaste el {dayMonth(coupon.usedAt!)}</p>}
            {state === "expired" && <p>Venció el {dayMonth(coupon.expiresAt)}</p>}
          </div>
          {active && (
            <a className={styles.use} href={SHOP_HREF} target="_blank" rel="noreferrer">
              Usarlo
              <Icon d={ARROW} />
            </a>
          )}
        </div>

        {!active && <p className={styles.stamp}>{state === "used" ? "Usado" : "Vencido"}</p>}
      </div>
    </li>
  );
}

// "Mis cupones" del inicio: un cupón por cada examen aprobado
export function Coupons() {
  const state = useCoupons();
  const [scratched, setScratched] = useState(readScratched);
  // La hora con la que se calcula qué venció: la de cuando se abrió la página
  const [now] = useState(() => Date.now());

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

  const coupons = sorted(state.coupons, now);
  const usable = coupons.filter((c) => stateOf(c, now) === "active").length;

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
      <ul className={styles.list}>
        {coupons.map((coupon, i) => (
          <Ticket
            key={coupon.code}
            coupon={coupon}
            state={stateOf(coupon, now)}
            now={now}
            index={i}
            scratched={scratched.includes(coupon.code)}
            onScratched={onScratched}
          />
        ))}
      </ul>
      <p className={styles.warn}>
        <Icon d={LOCK} />
        <span>
          <b>No compartas tus códigos.</b> No tienen nombre: quien use uno primero se queda con el descuento.
        </span>
      </p>
    </>
  );
}
