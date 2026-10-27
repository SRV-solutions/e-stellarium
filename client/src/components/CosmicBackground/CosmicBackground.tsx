import { useMemo, type CSSProperties } from "react";
import { seededRandom } from "../../lib/random";
import styles from "./CosmicBackground.module.css";

type Star = {
  x: number;
  y: number;
  r: number;
  opacity: number;
  twinkle?: { duration: number; delay: number };
};

function createStars(count: number, seed: number): Star[] {
  const rand = seededRandom(seed);
  return Array.from({ length: count }, () => {
    const big = rand() < 0.08;
    const star: Star = {
      x: rand() * 100,
      y: rand() * 100,
      r: big ? 1.3 + rand() * 0.7 : 0.4 + rand() * 0.7,
      opacity: big ? 0.75 + rand() * 0.25 : 0.2 + rand() * 0.45,
    };
    if (rand() < 0.16) {
      star.twinkle = { duration: 3 + rand() * 4, delay: rand() * 5 };
    }
    return star;
  });
}

// Constelación: un camino de estrellas que termina en la estrella naranja
const CONSTELLATION: [number, number][] = [
  [66, 9], [72, 15], [80, 13], [86, 20], [83, 28], [91, 31],
];

type Props = {
  starCount?: number;
  seed?: number;
};

export function CosmicBackground({ starCount = 170, seed = 2026 }: Props) {
  const stars = useMemo(() => createStars(starCount, seed), [starCount, seed]);

  return (
    <div className={styles.root} aria-hidden="true">
      <div className={`${styles.nebula} ${styles.blue}`} />
      <div className={`${styles.nebula} ${styles.indigo}`} />
      <div className={`${styles.nebula} ${styles.green}`} />
      <div className={styles.milkyway} />

      <svg className={styles.stars}>
        {stars.map((s, i) => (
          <circle
            key={i}
            cx={`${s.x}%`}
            cy={`${s.y}%`}
            r={s.r}
            opacity={s.opacity}
            className={s.twinkle ? styles.twinkle : undefined}
            style={
              s.twinkle
                ? ({
                    "--o": s.opacity,
                    "--t": `${s.twinkle.duration}s`,
                    "--d": `${s.twinkle.delay}s`,
                  } as CSSProperties)
                : undefined
            }
          />
        ))}

        <g className={styles.constellation}>
          {CONSTELLATION.slice(0, -1).map(([x1, y1], i) => {
            const [x2, y2] = CONSTELLATION[i + 1];
            return <line key={i} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`} />;
          })}
          {CONSTELLATION.map(([x, y], i) => {
            const isLast = i === CONSTELLATION.length - 1;
            return (
              <circle
                key={i}
                cx={`${x}%`}
                cy={`${y}%`}
                r={isLast ? 2.4 : 1.7}
                className={isLast ? styles.goal : undefined}
              />
            );
          })}
        </g>
      </svg>

      <div className={styles.shooting} />
    </div>
  );
}