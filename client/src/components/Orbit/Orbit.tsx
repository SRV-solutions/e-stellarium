import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import styles from "./Orbit.module.css";

// Elipse completa, recorrida en dos medias vueltas
const ORBIT_PATH = "M390 200 A190 58 0 1 1 10 200 A190 58 0 1 1 390 200";

export function Orbit() {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <svg className={styles.orbit} viewBox="0 0 400 400" aria-hidden="true">
      <g transform="rotate(-18 200 200)">
        <ellipse cx="200" cy="200" rx="190" ry="58" className={styles.ring} />
        {!reducedMotion && (
          <>
            <circle r="9" className={styles.moonGlow}>
              <animateMotion dur="38s" repeatCount="indefinite" path={ORBIT_PATH} />
            </circle>
            <circle r="3.6" className={styles.moon}>
              <animateMotion dur="38s" repeatCount="indefinite" path={ORBIT_PATH} />
            </circle>
          </>
        )}
      </g>
    </svg>
  );
}