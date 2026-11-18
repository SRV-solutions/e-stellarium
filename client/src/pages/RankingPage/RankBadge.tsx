// La insignia de racha en versión compacta, para las filas del ranking: el anillo lleno (ya la ganó),
// el cometa arriba y los días abajo. Más días, más colas (igual que StreakBadge)
const LENGTH = 2 * Math.PI * 27;

export function RankBadge({ days, size = 34 }: { days: number; size?: number }) {
  const tails = days >= 100 ? 3 : days >= 30 ? 2 : 1;
  return (
    <svg width={size} height={size} viewBox="-32 -32 64 64" role="img" aria-label={`Insignia de ${days} días`}>
      <circle r="27" fill="var(--night-2)" stroke="var(--line)" strokeWidth="5" />
      <circle r="27" fill="none" stroke="#dff6ff" strokeWidth="5" strokeLinecap="round" transform="rotate(-90)" strokeDasharray={LENGTH} />
      <circle cx="6" cy="-8" r="11" fill="var(--glint)" opacity=".18" />
      {Array.from({ length: tails }, (_, i) => (
        <path
          key={i}
          d={`M${3 - i * 3} ${-9 + i * 4} Q -8 ${-5 + i * 3} -17 ${i * 2}`}
          fill="none"
          stroke="#dff6ff"
          strokeWidth={3 - i * 0.7}
          strokeLinecap="round"
          opacity={0.85 - i * 0.22}
        />
      ))}
      <circle cx="6" cy="-14" r="5.5" fill="#fff" />
      <text x="0" y="19" textAnchor="middle" fontSize="19" fontWeight="800" fill="#fff" fontFamily="var(--font)">
        {days}
      </text>
    </svg>
  );
}
