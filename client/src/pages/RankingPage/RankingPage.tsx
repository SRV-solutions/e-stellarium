import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { AppHeader } from "../../components/AppHeader/AppHeader";
import { Avatar } from "../../components/Avatar/Avatar";
import { Cosmos } from "../../components/Cosmos/Cosmos";
import { Glint } from "../../components/Glint/Glint";
import { api } from "../../lib/api";
import type { Ranking, RankingBoardId } from "../../types";
import { Magnitude, xp as format } from "../ChallengesPage/RankingBoard";
import { BOARDS } from "./boards";
import { RankBadge } from "./RankBadge";
import styles from "./RankingPage.module.css";

const unitOf = (unit: string, one: string | undefined, n: number) => (n === 1 && one ? one : unit);

// El ranking: seis tablas para mirar el cielo. Se elige una en el índice y se ve su top 10 y tu puesto
export function RankingPage() {
  const { user } = useAuth();
  const [board, setBoard] = useState<RankingBoardId>("xp");
  const [period, setPeriod] = useState<Ranking["period"]>("week");
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [failed, setFailed] = useState(false);
  const indexRef = useRef<HTMLUListElement>(null);
  const info = BOARDS.find((b) => b.id === board)!;

  useEffect(() => {
    let cancelled = false;
    api<Ranking>(`/ranking?board=${board}&period=${period}`)
      .then((r) => !cancelled && setRanking(r))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [board, period]);

  // Al cambiar de tabla o de período se borra lo anterior: mientras llega lo nuevo se ve "Cargando"
  function show(nextBoard: RankingBoardId, nextPeriod: Ranking["period"]) {
    setRanking(null);
    setFailed(false);
    setBoard(nextBoard);
    setPeriod(nextPeriod);
  }

  function choose(id: RankingBoardId, button: HTMLButtonElement) {
    show(id, period);
    // En el celular el índice se desliza: la elegida queda a la vista
    button.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }

  const top = ranking?.top ?? [];
  const me = ranking?.me ?? null;
  const outside = me && me.position !== null && me.position > top.length;
  const withBadge = board === "best_streak" || board === "streak";
  const sub = board === "xp" && period === "week"
    ? "Suma todo lo que jugás en la semana: estrellas, repaso y desafíos. Se reinicia el lunes a las 00:00."
    : board === "xp"
      ? "Toda la experiencia desde que empezaste."
      : info.sub;

  // Lo que te falta para subir
  let chase = null;
  if (me && me.position === null && top.length > 0) {
    chase = <p className={styles.chase}>Todavía no estás en esta tabla. {info.id === "xp" ? "Cualquier acierto te pone en el cielo." : "Jugá y vas a aparecer."}</p>;
  } else if (me && outside) {
    chase = (
      <p className={styles.chase}>
        Te faltan <b>{format(top.at(-1)!.value - me.value + 1)} {info.unit}</b> para entrar entre las {top.length} más brillantes.
      </p>
    );
  } else if (me && me.position !== null && me.position > 1) {
    const above = top[me.position - 2]!;
    chase = (
      <p className={styles.chase}>
        Con <b>{format(above.value - me.value + 1)} {info.unit}</b> más pasás a <b>{above.alias}</b>.
      </p>
    );
  }

  const value = (n: number) => (
    <span className={`${styles.val} ${board === "glints" ? styles.glintVal : ""}`}>
      {board === "glints" && <Glint />}
      {format(n)} <small>{unitOf(info.unit, info.one, n)}</small>
    </span>
  );

  return (
    <>
      <Cosmos />
      <AppHeader />
      <main className={styles.page}>
        <div className={styles.head}>
          <p className={styles.eyebrow}>Ranking</p>
          <h1>Las más brillantes</h1>
          <p className={styles.lead}>Seis maneras de mirar el cielo: elegí la que mejor te quede para ver quién brilla más.</p>
        </div>

        <div className={styles.layout}>
          <ul className={styles.index} ref={indexRef} aria-label="Tablas del ranking">
            {BOARDS.map((b) => (
              <li key={b.id}>
                <button type="button" aria-pressed={b.id === board} onClick={(e) => choose(b.id, e.currentTarget)}>
                  <span className={styles.gl}>{b.icon}</span>
                  <span className={styles.name}>{b.name}</span>
                  <small>{b.desc}</small>
                </button>
              </li>
            ))}
          </ul>

          <section className={styles.rank} aria-labelledby="rank-title" aria-live="polite">
            <h2 id="rank-title">{info.name}</h2>
            <p className={styles.sub}>{sub}</p>
            {board === "xp" && (
              <div className={styles.seg} role="group" aria-label="Período">
                <button type="button" aria-pressed={period === "week"} onClick={() => show(board, "week")}>
                  Esta semana
                </button>
                <button type="button" aria-pressed={period === "all"} onClick={() => show(board, "all")}>
                  Desde siempre
                </button>
              </div>
            )}

            {failed ? (
              <p className={styles.empty}>No pudimos cargar el ranking. Probá de nuevo en un rato.</p>
            ) : !ranking ? (
              <p className={styles.empty} role="status">
                Cargando el ranking...
              </p>
            ) : top.length === 0 ? (
              <p className={styles.empty}>{info.empty}</p>
            ) : (
              <>
                <ol className={`${styles.board} ${withBadge ? styles.withBadge : ""}`}>
                  {top.map((e) => (
                    <li key={e.position} className={e.me ? styles.mine : ""}>
                      <span className={styles.pos}>{e.position}</span>
                      <span className={styles.mag}>
                        <Magnitude position={e.position} />
                      </span>
                      <Avatar alias={e.alias} frame={e.frame} drawing={e.avatar} size={34} />
                      <span className={styles.who}>
                        <span className={styles.alias}>{e.me ? `${e.alias} (vos)` : e.alias}</span>
                        {e.title && <small className={styles.title}>{e.title}</small>}
                      </span>
                      {withBadge && <span className={styles.badge}>{e.badge && <RankBadge days={e.badge} />}</span>}
                      {value(e.value)}
                    </li>
                  ))}
                  {outside && me && (
                    <>
                      <li aria-hidden="true" className={styles.gap}>
                        ···
                      </li>
                      <li className={styles.mine}>
                        <span className={styles.pos}>{me.position}</span>
                        <span className={styles.mag}>
                          <Magnitude position={me.position!} />
                        </span>
                        <Avatar alias={user?.alias ?? ""} frame={user?.wornFrame ?? null} drawing={user?.avatar ?? null} size={34} />
                        <span className={styles.who}>
                          <span className={styles.alias}>Vos</span>
                        </span>
                        {withBadge && <span className={styles.badge} />}
                        {value(me.value)}
                      </li>
                    </>
                  )}
                </ol>
                {chase}
                {board === "streak" && <p className={styles.tie}>En un empate va primero el que se sumó antes.</p>}
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
