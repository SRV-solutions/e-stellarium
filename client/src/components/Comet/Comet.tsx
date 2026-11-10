import { useId } from "react";
import styles from "./Comet.module.css";

type Props = {
  streak: number;
  activeToday: boolean;
  size: "small" | "large"; // small: en el encabezado; large: en el inicio
  className?: string;
};

// La racha como un cometa: la cabeza es hoy y cada puntito de la cola es un día seguido (hasta 7).
// Si todavía no jugó hoy, la cabeza tiene la mira naranja; si la racha se cortó, queda solo la cabeza apagada
export function Comet({ streak, activeToday, size, className = "" }: Props) {
  // Cada cometa necesita ids propios para sus degradés: en la página puede haber dos
  const id = useId();
  const big = size === "large";
  const state = streak === 0 ? styles.off : activeToday ? "" : styles.risk;

  const width = big ? 150 : 30;
  const height = big ? 84 : 20;
  const hx = width - (big ? 16 : 5);
  // En el encabezado, la cabeza va a media altura para quedar alineada con el número
  const hy = big ? 18 : streak > 0 ? 8 : 10;
  const r = big ? 7 : 3.2;
  const length = big ? 40 + Math.min(streak, 30) * 2.6 : 22;
  // La cola baja hacia la izquierda en una curva suave. t va de 0 (la cabeza) a 1 (la punta)
  const at = (t: number) => ({ x: hx - length * t, y: hy + (big ? 50 : 6) * t * t });
  const end = at(1);
  const mid = at(0.5);

  const days = Math.min(streak, big ? 7 : 3);
  const dots = Array.from({ length: days }, (_, i) => {
    const k = i + 1;
    const p = big ? at(k / (days + 1)) : at(k / 4);
    return { ...p, r: big ? 2.6 - k * 0.22 : 1.5 - k * 0.25, delay: k * 70 };
  });

  return (
    <svg
      className={`${styles.comet} ${state} ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}tail`} gradientUnits="userSpaceOnUse" x1={hx} y1={hy} x2={end.x} y2={end.y}>
          <stop offset="0" stopColor="#bcd8ff" stopOpacity=".55" />
          <stop offset="1" stopColor="#bcd8ff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}halo`}>
          <stop offset="0" stopColor="#e6f0ff" stopOpacity=".6" />
          <stop offset=".4" stopColor="#7fb6ff" stopOpacity=".2" />
          <stop offset="1" stopColor="#7fb6ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {streak > 1 && (
        <path
          className={styles.tail}
          stroke={`url(#${id}tail)`}
          strokeWidth={big ? 7 : 3}
          d={`M${hx} ${hy} Q${mid.x + (big ? 6 : 1)} ${mid.y - (big ? 8 : 2)} ${end.x} ${end.y}`}
        />
      )}
      {dots.map((d, i) => (
        <circle
          key={i}
          className={`${styles.day} ${big ? styles.pop : ""}`}
          style={big ? { animationDelay: `${d.delay}ms` } : undefined}
          cx={d.x}
          cy={d.y}
          r={d.r}
        />
      ))}
      <circle className={styles.halo} fill={`url(#${id}halo)`} cx={hx} cy={hy} r={r * 3.2} />
      <circle className={styles.head} cx={hx} cy={hy} r={r} />
      {streak > 0 && !activeToday && (
        <circle className={styles.wait} cx={hx} cy={hy} r={r + (big ? 6 : 3)} strokeWidth={big ? 1.5 : 1.1} />
      )}
    </svg>
  );
}
