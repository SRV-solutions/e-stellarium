import styles from "./Avatar.module.css";

type Props = {
  alias: string;
  frame: string | null; // el marco puesto (orbit, eclipse, rings) o ninguno
  size?: number; // en píxeles; el marco crece con el avatar
  className?: string;
};

// Las dos primeras letras del alias en un círculo y, encima, el marco que compró en la tienda
export function Avatar({ alias, frame, size = 34, className = "" }: Props) {
  return (
    <span
      className={`${styles.avatar} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {alias.slice(0, 2).toUpperCase()}
      {frame && <Frame id={frame} />}
    </span>
  );
}

// El marco se dibuja en un cuadro de 48 que sobresale 7 de cada lado de un avatar de 34
// (por eso el inset en porcentaje): así sirve igual para cualquier tamaño
const C = 24; // el centro
const R = 24; // el radio

function Frame({ id }: { id: string }) {
  if (id === "orbit") {
    // Una órbita punteada y una luna que la recorre
    return (
      <svg className={styles.frame} viewBox="0 0 48 48">
        <circle cx={C} cy={C} r={R - 2} fill="none" stroke="rgba(143,227,255,.45)" strokeWidth="1.2" strokeDasharray="2 3" />
        <g className={styles.moon}>
          <circle cx={C} cy="2" r="2.6" fill="#dff6ff" />
        </g>
      </svg>
    );
  }
  if (id === "eclipse") {
    // Un anillo dorado con doce rayos, largos y cortos alternados, como la corona de un eclipse
    const rays = Array.from({ length: 12 }, (_, i) => {
      const angle = (i * Math.PI) / 6;
      const r1 = R - 1;
      const r2 = R + (i % 2 ? 1.5 : 3.5);
      return (
        <line
          key={i}
          x1={C + Math.cos(angle) * r1}
          y1={C + Math.sin(angle) * r1}
          x2={C + Math.cos(angle) * r2}
          y2={C + Math.sin(angle) * r2}
          stroke="#ffd98a"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity=".7"
        />
      );
    });
    return (
      <svg className={styles.frame} viewBox="0 0 48 48">
        <circle cx={C} cy={C} r={R - 2.5} fill="none" stroke="#ffd98a" strokeWidth="2.2" opacity=".9" />
        {rays}
      </svg>
    );
  }
  if (id === "rings") {
    // Dos anillos inclinados, como Saturno
    return (
      <svg className={styles.frame} viewBox="0 0 48 48">
        <ellipse cx={C} cy={C} rx={R + 4} ry={R * 0.38} fill="none" stroke="#e8d3a8" strokeWidth="1.6" transform={`rotate(-18 ${C} ${C})`} opacity=".85" />
        <ellipse cx={C} cy={C} rx={R + 8} ry={R * 0.5} fill="none" stroke="#e8d3a8" strokeWidth="1" transform={`rotate(-18 ${C} ${C})`} opacity=".45" />
      </svg>
    );
  }
  return null;
}
