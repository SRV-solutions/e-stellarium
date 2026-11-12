import styles from "./StreakBadge.module.css";

type Props = {
  days: number; // 7, 30 o 100
  earned: boolean; // ganada: queda para siempre, aunque la racha se corte
  streak: number; // la racha de hoy: llena el anillo de las que faltan
  className?: string;
};

const R = 27;
const LENGTH = 2 * Math.PI * R;

// La insignia de racha: el cometa dentro de un anillo que se llena con los días.
// Más días, más colas: el fugaz tiene una, el periódico dos y el gran cometa tres
export function StreakBadge({ days, earned, streak, className = "" }: Props) {
  const progress = earned ? 1 : Math.min(1, streak / days);
  const tails = days >= 100 ? 3 : days >= 30 ? 2 : 1;
  const color = earned ? "#dff6ff" : "var(--dim)";

  return (
    <svg viewBox="-32 -32 64 64" className={`${styles.badge} ${earned ? "" : styles.off} ${className}`} aria-hidden="true">
      <circle className={styles.track} r={R} />
      <circle
        className={styles.ring}
        r={R}
        transform="rotate(-90)"
        strokeDasharray={LENGTH}
        strokeDashoffset={LENGTH * (1 - progress)}
      />
      {Array.from({ length: tails }, (_, i) => (
        <path
          key={i}
          d={`M${2 - i * 3} ${-2 + i * 4} Q -10 ${4 + i * 3} -19 ${11 + i * 2}`}
          fill="none"
          stroke={color}
          strokeWidth={2.2 - i * 0.5}
          strokeLinecap="round"
          opacity={earned ? 0.8 - i * 0.2 : 0.6}
        />
      ))}
      <circle cx="5" cy="-5" r={earned ? 5 : 4} fill={color} />
      {earned && <circle cx="5" cy="-5" r="10" fill="var(--glint)" opacity=".18" />}
      <text x="0" y="22" textAnchor="middle" className={styles.days}>
        {days}
      </text>
    </svg>
  );
}
