import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { burst, centerOf } from "../../lib/effects";
import { formatMoment } from "../../lib/time";
import type { Coupon, ExamInfo, ExamProgress } from "../../types";
import { Countdown } from "./Countdown";
import styles from "./ExamPage.module.css";

type Result = Extract<ExamProgress, { status: "finished" }>;

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />
    </svg>
  );
}

// Un punto sobre el círculo: deg 0 es arriba y gira como las agujas del reloj
function at(deg: number, r: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [105 + Math.cos(a) * r, 105 + Math.sin(a) * r] as const;
}

// Un arco por pregunta (blanco si estuvo bien), la marca del 7 y la estrella, encendida solo si aprobó
function ResultStar({ results, passed, passMark }: { results: boolean[]; passed: boolean; passMark: number }) {
  const step = 360 / results.length;
  const gap = 9;
  const r = 72;
  let lit = 0;
  const [m1x, m1y] = at(passMark * step, r - 9);
  const [m2x, m2y] = at(passMark * step, r + 9);
  const [tx, ty] = at(passMark * step, r + 22);
  const correct = results.filter(Boolean).length;

  return (
    <svg viewBox="0 0 210 210">
      <defs>
        <filter id="result-bloom" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="result-bloomBig" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="result-halo">
          <stop offset="0" stopColor="#d9e8ff" stopOpacity=".6" />
          <stop offset=".4" stopColor="#5aa9ff" stopOpacity=".25" />
          <stop offset="1" stopColor="#5aa9ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {passed && <circle className={styles.glow} cx="105" cy="105" r="100" />}

      {results.map((ok, i) => {
        const [x1, y1] = at(i * step + gap / 2, r);
        const [x2, y2] = at((i + 1) * step - gap / 2, r);
        return (
          <path
            key={i}
            className={`${styles.arc} ${ok ? styles.arcOk : styles.arcBad}`}
            style={{ "--k": ok ? lit++ : 0 } as CSSProperties}
            pathLength={1}
            d={`M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`}
          />
        );
      })}

      <line className={styles.mark} x1={m1x} y1={m1y} x2={m2x} y2={m2y} />
      <text className={styles.markTxt} x={tx} y={ty + 4} textAnchor="middle">
        {passMark}
      </text>

      {passed ? (
        <>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => {
            const [x1, y1] = at(a, 34);
            const [x2, y2] = at(a, a % 90 ? 50 : 60);
            return (
              <line
                key={a}
                className={styles.ray}
                style={{ "--k": i } as CSSProperties}
                pathLength={1}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
              />
            );
          })}
          <circle className={`${styles.core} ${styles.coreLit}`} cx="105" cy="105" r="16" />
        </>
      ) : (
        <>
          <circle className={styles.core} cx="105" cy="105" r="30" />
          <text className={styles.score} x="105" y="108" textAnchor="middle">
            {correct}
          </text>
          <text className={styles.of} x="105" y="121" textAnchor="middle">
            de {results.length}
          </text>
        </>
      )}
    </svg>
  );
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

// El cupón: una ficha de catálogo con el talón separado, y el aviso de no compartirlo
function CouponCard({ coupon }: { coupon: Coupon }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
    } catch {
      // Si el navegador no deja copiar, el código sigue a la vista para copiarlo a mano
    }
  }

  return (
    <div className={styles.coupon}>
      <div className={styles.pct}>
        <b>{coupon.percent} %</b>
        <span>de descuento</span>
      </div>
      <div className={styles.couponBody}>
        <p className={styles.couponLabel}>Tu cupón</p>
        <div className={styles.codeRow}>
          <code>{coupon.code}</code>
          <button type="button" className={`${styles.copy} ${copied ? styles.copied : ""}`} onClick={copy}>
            {copied ? (
              "Copiado"
            ) : (
              <>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="8" y="8" width="12" height="12" rx="2" />
                  <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
                </svg>
                Copiar
              </>
            )}
          </button>
        </div>
        <p className={styles.meta}>
          Para tu próximo curso en wearesrv.com. Vence el <b>{longDate(coupon.expiresAt)}</b>. También te lo
          mandamos por mail.
        </p>
      </div>
      <p className={styles.warn}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <span>
          <b>No compartas este código con nadie.</b> Sirve una sola vez y no tiene nombre: quien lo use primero se
          queda con el descuento, y no se puede recuperar.
        </span>
      </p>
    </div>
  );
}

type Props = {
  info: ExamInfo;
  result: Result;
  kicker: React.ReactNode;
  fresh: boolean; // recién terminado (con animaciones y +XP) o vuelve a mirarlo
  onRetryOpens: () => void;
};

export function ExamResult({ info, result, kicker, fresh, onRetryOpens }: Props) {
  const star = useRef<HTMLDivElement>(null);
  const constellation = `/constellations/${info.course.key}`;

  // Al aprobar, un estallido de partículas cuando se enciende la estrella
  useEffect(() => {
    if (!fresh || !result.passed) return;
    const timer = setTimeout(() => star.current && burst(centerOf(star.current), "#ffd18a", 26), 1300);
    return () => clearTimeout(timer);
  }, [fresh, result.passed]);

  if (result.passed) {
    return (
      <main className={styles.end}>
        <div>
          <div ref={star} className={styles.result} aria-hidden="true">
            <ResultStar results={result.results} passed passMark={info.rules.passMark} />
          </div>
          {kicker}
          <h1>Aprobaste: la constelación está completa</h1>
          <p className={styles.lead}>
            Acertaste{" "}
            <b>
              {result.correctCount} de {result.total}
            </b>
            . Encendiste todas las estrellas de {info.course.name}.
          </p>
          {fresh && result.xpGained > 0 && (
            <p className={styles.gain}>
              <StarIcon />+{result.xpGained} XP
            </p>
          )}
          {result.coupon && <CouponCard coupon={result.coupon} />}
          <div className={styles.actions}>
            <Link to={constellation} className={styles.ghost}>
              Ver la constelación
            </Link>
            <Link to="/" className={styles.go}>
              Ir al inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.end}>
      <div>
        <div className={styles.result} aria-hidden="true">
          <ResultStar results={result.results} passed={false} passMark={info.rules.passMark} />
        </div>
        {kicker}
        <h1>Esta vez no alcanzó</h1>
        <p className={styles.lead}>
          Acertaste{" "}
          <b>
            {result.correctCount} de {result.total}
          </b>{" "}
          y hacían falta {info.rules.passMark}. La próxima vez salen otras preguntas del banco.
        </p>
        {result.retryOpensAt && (
          <>
            <Countdown until={result.retryOpensAt} onDone={onRetryOpens} />
            <p className={styles.when}>
              Podés volver a intentarlo <b>{formatMoment(new Date(result.retryOpensAt))}</b>
            </p>
          </>
        )}
        <div className={styles.actions}>
          <Link to="/" className={styles.ghost}>
            Ir al inicio
          </Link>
          <Link to={constellation} className={styles.go}>
            <StarIcon />
            Repasar las lecciones
          </Link>
        </div>
        <p className={styles.fine}>Los intentos no tienen límite.</p>
      </div>
    </main>
  );
}
