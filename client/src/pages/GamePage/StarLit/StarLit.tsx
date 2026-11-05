import { useEffect, useState } from "react";
import { Link } from "react-router";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";
import { greekLetter } from "../../../lib/sky";
import type { StarPlay } from "../../../types";
import styles from "./StarLit.module.css";

type Props = {
  star: StarPlay["star"];
  nextStar: StarPlay["nextStar"];
  courseKey: string;
  answersXp: number;
  starXp: number;
};

// Los 8 rayos naranjas: los de los ejes, más largos que los diagonales
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315].map((degrees) => {
  const angle = (degrees * Math.PI) / 180;
  const end = degrees % 90 ? 72 : 92;
  return {
    x1: 120 + Math.cos(angle) * 46,
    y1: 120 + Math.sin(angle) * 46,
    x2: 120 + Math.cos(angle) * end,
    y2: 120 + Math.sin(angle) * end,
  };
});

// Cuenta de 0 hasta target, frenando al final. Arranca después de delay (ms)
function useCountUp(target: number, delay: number, duration: number) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => (frame = requestAnimationFrame(tick)), delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, delay, duration, reduced]);

  return value;
}

export function StarLit({ star, nextStar, courseKey, answersXp, starXp }: Props) {
  const total = useCountUp(answersXp + starXp, 1600, 1100);
  // El examen no se abre al encender la última lección, así que solo seguimos si viene otra lección
  const next = nextStar?.kind === "lesson" ? nextStar : null;
  const nextName = next && `${greekLetter(next.position - 1)} ${next.title}`;

  return (
    <main className={styles.done}>
      <div>
        <div className={styles.ignite} aria-hidden="true">
          <svg viewBox="0 0 240 240">
            <defs>
              <radialGradient id="starlit-corona">
                <stop offset="0" stopColor="#d9e8ff" stopOpacity="0.8" />
                <stop offset="0.35" stopColor="#5aa9ff" stopOpacity="0.35" />
                <stop offset="1" stopColor="#5aa9ff" stopOpacity="0" />
              </radialGradient>
              <filter id="starlit-bloom" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle className={styles.wave} cx="120" cy="120" r="40" />
            <circle className={`${styles.wave} ${styles.w2}`} cx="120" cy="120" r="40" />
            <circle className={`${styles.wave} ${styles.w3}`} cx="120" cy="120" r="40" />
            <circle className={styles.corona} cx="120" cy="120" r="110" />
            {RAYS.map((ray, i) => (
              <line key={i} className={styles.ray} {...ray} />
            ))}
            <line className={styles.spike} x1="10" y1="120" x2="230" y2="120" />
            <line className={styles.spike} x1="120" y1="10" x2="120" y2="230" />
            <circle className={styles.core} cx="120" cy="120" r="22" />
          </svg>
        </div>

        <p className={styles.kicker}>
          <b>{greekLetter(star.position - 1)}</b> {star.title}
        </p>
        <h1 className={styles.title}>Estrella encendida</h1>
        {nextName && (
          <p className={styles.unlock}>
            Se abrió <b>{nextName}</b> en tu constelación.
          </p>
        )}

        <p className={styles.total} aria-label={`${answersXp + starXp} XP`}>
          <b>{total}</b>
          <span>XP</span>
        </p>
        <p className={styles.split}>
          {answersXp > 0
            ? `${answersXp} por las respuestas y ${starXp} por encender la estrella`
            : `${starXp} por encender la estrella`}
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
                Seguir con {nextName}
              </Link>
            </>
          ) : (
            <Link to={`/constellations/${courseKey}`} className={styles.go}>
              Volver a la constelación
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
