import { Link } from "react-router";
import type { StepResult } from "../../../components/MiniConstellation/MiniConstellation";
import type { StarPlay, StudentQuestion } from "../../../types";
import { KIND } from "../kinds";
import styles from "./StarUnfinished.module.css";

type Props = {
  // "end": terminó una vuelta sin encenderla. "resume": vuelve a una estrella que dejó a medias
  mode: "end" | "resume";
  star: StarPlay["star"];
  questions: StudentQuestion[];
  results: StepResult[];
  xp: number;
  courseKey: string;
  onRetry: () => void;
};

const R = 64; // el radio de los arcos
const GAP = 14; // los grados que se dejan libres entre arco y arco

// Un punto del círculo, en grados: 0 es arriba y se avanza como las agujas del reloj
function at(degrees: number) {
  const angle = ((degrees - 90) * Math.PI) / 180;
  return { x: 100 + Math.cos(angle) * R, y: 100 + Math.sin(angle) * R };
}

// El arco de la pregunta i, de n
function arc(i: number, n: number) {
  const step = 360 / n;
  const from = at(i * step + GAP / 2);
  const to = at((i + 1) * step - GAP / 2);
  return `M${from.x} ${from.y} A${R} ${R} 0 0 1 ${to.x} ${to.y}`;
}

export function StarUnfinished({ mode, star, questions, results, xp, courseKey, onRetry }: Props) {
  const n = questions.length;
  const ok = results.filter((r) => r === "ok").length;
  const missing = questions.filter((_, i) => results[i] !== "ok");
  const resume = mode === "resume";

  let title;
  if (resume) title = "Seguís donde quedaste";
  else if (ok === 0) title = "Esta todavía no enciende";
  else if (missing.length === 1) title = "Te falta 1 para encenderla";
  else title = `Te faltan ${missing.length} para encenderla`;

  let retry;
  if (resume) retry = missing.length === 1 ? "Seguir con la que falta" : `Seguir con las ${missing.length} que faltan`;
  else if (ok === 0) retry = "Reintentar la estrella";
  else if (missing.length === 1) retry = "Reintentar la que fallé";
  else retry = `Reintentar las ${missing.length} que fallé`;

  let lead;
  if (resume) {
    lead = (
      <>
        Ya acertaste <b>{ok} de {n}</b>. Te {missing.length === 1 ? "queda 1" : `quedan ${missing.length}`} para
        encenderla.
      </>
    );
  } else if (ok === 0) {
    lead = "No pasa nada: así se aprende. Leé las explicaciones y probá de nuevo.";
  } else {
    lead = (
      <>
        Acertaste <b>{ok} de {n}</b>. Lo que acertaste ya queda guardado: solo tenés que repetir{" "}
        {missing.length === 1 ? "la que fallaste" : "las que fallaste"}.
      </>
    );
  }

  // Los arcos acertados se dibujan de a uno: cada uno espera según cuántos acertados tiene antes
  const delays = results.map((_, i) => 0.3 + results.slice(0, i).filter((r) => r === "ok").length * 0.12);

  return (
    <main className={styles.end}>
      <div className={styles.inner}>
        <div className={styles.partial} aria-hidden="true">
          <svg viewBox="0 0 200 200">
            <defs>
              <radialGradient id="unfinished-halo">
                <stop offset="0" stopColor="#d9e8ff" stopOpacity="0.55" />
                <stop offset="0.4" stopColor="#5aa9ff" stopOpacity="0.22" />
                <stop offset="1" stopColor="#5aa9ff" stopOpacity="0" />
              </radialGradient>
              <filter id="unfinished-bloom" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="2.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle className={styles.glow} style={{ opacity: ok / n }} cx="100" cy="100" r="90" />
            {questions.map((q, i) =>
              results[i] === "ok" ? (
                <path
                  key={q.id}
                  className={styles.arcOk}
                  style={{ animationDelay: `${delays[i]}s` }}
                  pathLength={1}
                  d={arc(i, n)}
                />
              ) : (
                <path key={q.id} className={styles.arcMissing} pathLength={1} d={arc(i, n)} />
              ),
            )}
            <circle className={ok ? styles.coreWarm : styles.core} cx="100" cy="100" r={8 + (ok / n) * 8} />
          </svg>
        </div>

        <p className={styles.kicker}>
          <b>{star.letter}</b> {star.title}
        </p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lead}>{lead}</p>
        {xp > 0 && (
          <p className={styles.gain}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />
            </svg>
            +{xp} XP en esta vuelta
          </p>
        )}

        {ok > 0 && (
          <ul className={styles.missing} aria-label="Las que te faltan">
            {missing.map((q) => (
              <li key={q.id}>
                <span className={styles.pip} aria-hidden="true" />
                <span className={styles.kind}>{KIND[q.type]}</span>
                <span className={styles.prompt}>{q.prompt}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          <Link to={`/constellations/${courseKey}`} className={styles.ghost}>
            Volver a la constelación
          </Link>
          <button type="button" className={styles.go} onClick={onRetry}>
            {resume ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.starIcon}>
                <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.retryIcon}>
                <path d="M4 12a8 8 0 1 0 2.4-5.7" />
                <path d="M4 4v4.5h4.5" />
              </svg>
            )}
            {retry}
          </button>
        </div>
      </div>
    </main>
  );
}
