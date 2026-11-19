import type { CSSProperties } from "react";
import type { TrailEffect } from "../../types";
import styles from "./TrailSwatch.module.css";

// El trazo de una constelación, en su color y con su efecto: cuatro estrellas unidas. Lo usan la tienda y el inventario.
const POINTS = [
  [2, 24],
  [16, 12],
  [30, 18],
  [46, 4],
];
const LINE = POINTS.map((p) => p.join(",")).join(" ");

export function TrailSwatch({ color, effect = null, className = "" }: { color: string; effect?: TrailEffect | null; className?: string }) {
  return (
    <svg className={`${styles.trail} ${effect === "rainbow" ? styles.rainbow : ""} ${className}`} viewBox="0 0 48 28" aria-hidden="true">
      <polyline className={effect === "pulse" ? styles.pulse : undefined} points={LINE} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {effect === "flow" && <polyline className={styles.flow} points={LINE} pathLength={1} fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />}
      {effect === "comet" && <polyline className={styles.comet} points={LINE} pathLength={1} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />}
      {POINTS.map(([x, y], i) => (
        <g key={x}>
          <circle cx={x} cy={y} r="5" fill={color} opacity=".25" />
          <circle
            className={effect === "twinkle" ? styles.twinkle : undefined}
            style={{ animationDelay: `${(i * 0.37).toFixed(2)}s` } as CSSProperties}
            cx={x}
            cy={y}
            r="2.6"
            fill="#fff"
          />
        </g>
      ))}
    </svg>
  );
}
