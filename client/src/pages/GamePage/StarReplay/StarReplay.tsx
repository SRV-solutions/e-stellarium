import { Link } from "react-router";
import type { StepResult } from "../../../components/MiniConstellation/MiniConstellation";
import { greekLetter } from "../../../lib/sky";
import type { StarPlay } from "../../../types";
import styles from "./StarReplay.module.css";

type Props = {
  star: StarPlay["star"];
  nextStar: StarPlay["nextStar"];
  courseKey: string;
  results: StepResult[];
  onRetry: () => void;
};

// Los mismos rayos de "Estrella encendida", en un dibujo de 200 en vez de 240
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315].map((degrees) => {
  const angle = (degrees * Math.PI) / 180;
  const end = degrees % 90 ? 60 : 76;
  return {
    x1: 100 + Math.cos(angle) * 38,
    y1: 100 + Math.sin(angle) * 38,
    x2: 100 + Math.cos(angle) * end,
    y2: 100 + Math.sin(angle) * end,
  };
});

export function StarReplay({ star, nextStar, courseKey, results, onRetry }: Props) {
  const n = results.length;
  const ok = results.filter((r) => r === "ok").length;
  const bad = n - ok;
  const next = nextStar?.kind === "lesson" ? nextStar : null;

  return (
    <main className={styles.end}>
      <div className={styles.inner}>
        <div className={styles.lit} aria-hidden="true">
          <svg viewBox="0 0 200 200">
            <defs>
              <radialGradient id="replay-corona">
                <stop offset="0" stopColor="#d9e8ff" stopOpacity="0.8" />
                <stop offset="0.35" stopColor="#5aa9ff" stopOpacity="0.35" />
                <stop offset="1" stopColor="#5aa9ff" stopOpacity="0" />
              </radialGradient>
              <filter id="replay-bloom" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g className={styles.twinkle}>
              <circle className={styles.corona} cx="100" cy="100" r="92" />
              {RAYS.map((ray, i) => (
                <line key={i} className={styles.ray} {...ray} />
              ))}
              <line className={styles.spike} x1="10" y1="100" x2="190" y2="100" />
              <line className={styles.spike} x1="100" y1="10" x2="100" y2="190" />
            </g>
            <circle className={styles.core} cx="100" cy="100" r="18" />
          </svg>
        </div>

        <p className={styles.kicker}>
          <b>{greekLetter(star.position - 1)}</b> {star.title}
        </p>
        <h1 className={styles.title}>{bad ? "Repaso terminado" : "Repaso perfecto"}</h1>
        <p className={styles.lead}>
          Acertaste{" "}
          <b>
            {ok} de {n}
          </b>
          . Esta estrella ya la habías encendido, así que el repaso no suma experiencia: se gana una sola vez por
          pregunta.
        </p>

        <div className={styles.actions}>
          {next ? (
            <>
              <Link to={`/constellations/${courseKey}`} className={styles.ghost}>
                Volver a la constelación
              </Link>
              <Link to={`/stars/${next.id}`} className={styles.go}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />
                </svg>
                Seguir con {greekLetter(next.position - 1)} {next.title}
              </Link>
            </>
          ) : (
            <Link to={`/constellations/${courseKey}`} className={styles.go}>
              Volver a la constelación
            </Link>
          )}
        </div>
        {bad > 0 && (
          <button type="button" className={styles.textButton} onClick={onRetry}>
            {bad === 1 ? "Repasar la que fallaste" : `Repasar las ${bad} que fallaste`}
          </button>
        )}
      </div>
    </main>
  );
}
