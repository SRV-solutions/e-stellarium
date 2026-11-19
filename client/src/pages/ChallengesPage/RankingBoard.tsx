import { useAuth } from "../../auth/useAuth";
import { Avatar } from "../../components/Avatar/Avatar";
import type { Ranking } from "../../types";
import styles from "./RankingBoard.module.css";

type Props = {
  ranking: Ranking | null;
  period: Ranking["period"];
  onPeriod: (period: Ranking["period"]) => void;
};

// Oro, plata y bronce para los tres primeros: [color de la estrella, color del centro, nombre]
const PODIUM: Record<number, [string, string, string]> = {
  1: ["#ffc94a", "#fff1c2", "Oro"],
  2: ["#cfd9ea", "#ffffff", "Plata"],
  3: ["#d98b4f", "#ffd9b8", "Bronce"],
};

// La estrella de cada puesto: del podio con halo, del 4 al 10 blanca, y un puntito después
export function Magnitude({ position }: { position: number }) {
  if (position > 10) {
    return (
      <svg width="40" height="36" viewBox="-20 -18 40 36" aria-hidden="true">
        <circle r="2.2" fill="var(--muted)" />
      </svg>
    );
  }
  const medal = PODIUM[position];
  const f = medal ? 15 : 9;
  const color = medal ? medal[0] : "#fff";
  const ray = (n: number, w: number) => `M0 -${n} L${w} -${w} L${n} 0 L${w} ${w} L0 ${n} L-${w} ${w} L-${n} 0 L-${w} -${w} Z`;
  return (
    <svg width="40" height="36" viewBox="-20 -18 40 36" {...(medal ? { role: "img", "aria-label": medal[2] } : { "aria-hidden": true })}>
      {medal && (
        <>
          <defs>
            <radialGradient id={`halo${position}`}>
              <stop offset="0" stopColor={medal[0]} stopOpacity="0.55" />
              <stop offset="1" stopColor={medal[0]} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle r="13" fill={`url(#halo${position})`} />
        </>
      )}
      <path fill={color} opacity={medal ? 0.95 : 0.6} d={ray(f, 1.4)} />
      {medal && <path fill={color} opacity="0.5" transform="rotate(45)" d={ray(8, 1)} />}
      <circle r={medal ? 5 : 3.2} fill={medal ? medal[1] : "#fff"} />
    </svg>
  );
}

export const xp = (n: number) => n.toLocaleString("es-AR");

// "1 perfecto", "3 perfectos"
const perfects = (n: number) => `${xp(n)} ${n === 1 ? "perfecto" : "perfectos"}`;

// Las más brillantes: el ranking de la semana o de siempre, con tu fila apuntada con la mira
export function RankingBoard({ ranking, period, onPeriod }: Props) {
  const { user } = useAuth();
  const top = ranking?.top ?? [];
  const seasonName = ranking?.season.name || "la temporada";
  const me = ranking?.me ?? null;
  const outside = me && me.position !== null && me.position > top.length;

  // Lo que te falta para subir: entrar entre los 10, o pasar al de arriba
  let chase = null;
  if (me && me.position === null) {
    chase = (
      <p className={styles.empty}>
        Todavía no completaste un desafío con las 10 preguntas bien. Con uno ya entrás al ranking.
      </p>
    );
  } else if (me && outside && top.length > 0) {
    chase = (
      <p className={styles.chase}>
        Te faltan <b>{perfects(top.at(-1)!.value - me.value + 1)}</b> para entrar entre los {top.length} primeros.
      </p>
    );
  } else if (me && me.position !== null && me.position > 1) {
    const above = top[me.position - 2]!;
    chase = (
      <p className={styles.chase}>
        Con <b>{perfects(above.value - me.value + 1)}</b> más pasás a <b>{above.alias}</b>.
      </p>
    );
  }

  return (
    <aside className={styles.rank} aria-labelledby="rank-title">
      <h2 id="rank-title">Los desafíos perfectos</h2>
      <p className={styles.sub}>
        Desafíos completados con todas las preguntas bien.{" "}
        {period === "season" ? `Cuenta desde que empezó ${seasonName}.` : "Desde siempre, sin importar la temporada."}
      </p>
      <div className={styles.seg} role="group" aria-label="Período">
        <button type="button" aria-pressed={period === "season"} onClick={() => onPeriod("season")}>
          {ranking?.season.name || "Temporada"}
        </button>
        <button type="button" aria-pressed={period === "all"} onClick={() => onPeriod("all")}>
          Desde siempre
        </button>
      </div>

      {!ranking ? (
        <p className={styles.empty} role="status">
          Cargando el ranking...
        </p>
      ) : (
        <ol className={styles.board}>
          {top.map((e) => (
            <li key={e.position} className={e.me ? styles.mine : ""}>
              <span className={styles.pos}>{e.position}</span>
              <span className={styles.mag}>
                <Magnitude position={e.position} />
              </span>
              <Avatar alias={e.alias} frame={e.frame} drawing={e.avatar} size={30} />
              <span className={styles.who}>
                <span className={styles.alias}>{e.me ? `${e.alias} (vos)` : e.alias}</span>
                {e.title && <small className={styles.title}>{e.title}</small>}
              </span>
              <span className={styles.xp}>
                {xp(e.value)} <small>{e.value === 1 ? "perfecto" : "perfectos"}</small>
              </span>
            </li>
          ))}
          {outside && (
            <>
              <li aria-hidden="true" className={styles.gap}>
                ···
              </li>
              <li className={styles.mine}>
                <span className={styles.pos}>{me.position}</span>
                <span className={styles.mag}>
                  <Magnitude position={me.position!} />
                </span>
                <Avatar alias={user?.alias ?? ""} frame={user?.wornFrame ?? null} drawing={user?.avatar ?? null} size={30} />
                <span className={styles.who}>
                  <span className={styles.alias}>Vos</span>
                </span>
                <span className={styles.xp}>
                  {xp(me.value)} <small>{me.value === 1 ? "perfecto" : "perfectos"}</small>
                </span>
              </li>
            </>
          )}
        </ol>
      )}
      {top.length === 0 && ranking && !chase && <p className={styles.empty}>Todavía nadie completó un desafío sin errores.</p>}
      {chase}
    </aside>
  );
}
