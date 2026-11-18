import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { Glint } from "../../components/Glint/Glint";
import { api, ApiError } from "../../lib/api";
import { can } from "../../lib/permissions";
import type { RankingBoardId, RankingPeriod, SeasonHistory, StaffRanking } from "../../types";
import { BOARDS } from "../RankingPage/boards";
import { PrizeDialog } from "./PrizeDialog";
import { CloseSeasonDialog } from "./CloseSeasonDialog";
import { dayMonth, firstName } from "./people";
import { Toast } from "./Toast";
import common from "./PeoplePage.module.css";
import person from "./PersonCard.module.css";
import styles from "./StaffRankingPage.module.css";

const PERIOD_NAMES: Record<RankingPeriod, string> = { week: "Esta semana", season: "Temporada", all: "Desde siempre" };
const number = (n: number) => n.toLocaleString("es-AR");

// El ranking para el staff: las seis tablas con nombres y emails, premiar a los primeros y (el super admin)
// cerrar la temporada. Cerrar no borra nada: es una fecha de corte para las tablas que cuentan por temporada.
export function StaffRankingPage() {
  const { user } = useAuth();
  const canAward = can(user, "ranking:award");
  const canClose = can(user, "ranking:reset");

  const [board, setBoard] = useState<RankingBoardId>("xp");
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const [data, setData] = useState<StaffRanking | null>(null);
  const [seasons, setSeasons] = useState<SeasonHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [prizing, setPrizing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const clearToast = useCallback(() => setToast(null), []);
  const info = BOARDS.find((b) => b.id === board)!;

  useEffect(() => {
    let current = true;
    api<StaffRanking>(`/admin/ranking?board=${board}&period=${period}`).then(
      (r) => current && setData(r),
      (err) => current && setError(err instanceof ApiError ? err.message : "No pudimos cargar el ranking.")
    );
    return () => {
      current = false;
    };
  }, [board, period, reloads]);

  useEffect(() => {
    let current = true;
    api<SeasonHistory>("/admin/ranking/seasons").then(
      (r) => current && setSeasons(r),
      () => {}
    );
    return () => {
      current = false;
    };
  }, [reloads]);

  function show(nextBoard: RankingBoardId, nextPeriod: RankingPeriod) {
    setData(null);
    setError(null);
    setSelected([]);
    setBoard(nextBoard);
    setPeriod(nextPeriod);
  }

  function choose(id: RankingBoardId) {
    const periods = BOARDS.find((b) => b.id === id)!.periods;
    show(id, periods.includes(period) ? period : (periods[0] ?? "all"));
  }

  const changed = (message: string) => {
    setToast(message);
    setSelected([]);
    setData(null);
    setReloads((n) => n + 1);
  };

  const top = data?.top ?? [];
  const picked = top.filter((p) => selected.includes(p.userId));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const seasonName = seasons?.current.name ?? data?.season.name ?? "Temporada";

  return (
    <div className={common.page}>
      <div className={common.head}>
        <h1>Ranking</h1>
        <p>
          Lo mismo que ven los alumnos, pero con nombre y email. {canAward ? "Premiá a los primeros" : "Mirá quién va primero"}
          {canClose ? " y, cuando toque, empezá una temporada nueva." : "."}
        </p>
      </div>

      <div className={styles.season}>
        <span className={styles.live}>
          <b>{seasonName}</b>
        </span>
        <span>
          {seasons ? `desde el ${dayMonth(seasons.current.startedAt)}` : ""}
          {data ? ` · ${data.students} ${data.students === 1 ? "alumno compite" : "alumnos compiten"}` : ""}
        </span>
        {canClose && seasons && (
          <button type="button" className={`${person.button} ${person.danger} ${styles.sm} ${styles.push}`} onClick={() => setClosing(true)}>
            Cerrar temporada…
          </button>
        )}
      </div>

      <div className={styles.layout}>
        <ul className={styles.index} aria-label="Tablas">
          {BOARDS.map((b) => (
            <li key={b.id}>
              <button type="button" aria-pressed={b.id === board} onClick={() => choose(b.id)}>
                <b>{b.name}</b>
                <small>
                  {b.periods.length === 0
                    ? "No se reinicia"
                    : b.periods.length === 3
                      ? "Semana · temporada · siempre"
                      : "Temporada · siempre"}
                </small>
              </button>
            </li>
          ))}
        </ul>

        <section className={styles.rank} aria-labelledby="staff-rank-title">
          <h2 id="staff-rank-title">{info.name}</h2>
          <p className={styles.sub}>{info.sub}</p>
          <div className={styles.bar}>
            {info.periods.length > 0 && (
              <div className={common.kinds} role="group" aria-label="Período">
                {info.periods.map((p) => (
                  <button key={p} type="button" aria-pressed={period === p} onClick={() => show(board, p)}>
                    {p === "season" ? seasonName : PERIOD_NAMES[p]}
                  </button>
                ))}
              </div>
            )}
            <span className={styles.hint}>
              {info.periods.length === 0
                ? "Esta tabla no depende de la temporada: nunca se reinicia."
                : period === "season"
                  ? "Cuenta desde que arrancó la temporada."
                  : period === "week"
                    ? "De lunes 00:00 a lunes 00:00."
                    : ""}
            </span>
            {canAward && top.length > 0 && (
              <span className={styles.quick}>
                Elegir
                <button type="button" className={`${person.button} ${styles.sm}`} onClick={() => setSelected(top.slice(0, 3).map((p) => p.userId))}>
                  Top 3
                </button>
                <button type="button" className={`${person.button} ${styles.sm}`} onClick={() => setSelected([])} disabled={selected.length === 0}>
                  Ninguno
                </button>
              </span>
            )}
          </div>

          {error && (
            <p className={common.error} role="alert">
              {error}
            </p>
          )}
          {!error && !data && <p className={styles.none}>Cargando…</p>}
          {data && top.length === 0 && <p className={styles.none}>{info.empty}</p>}
          {top.length > 0 && (
            <ol className={`${styles.board} ${canAward ? styles.withBox : ""}`}>
              {top.map((p) => (
                <li key={p.userId} className={selected.includes(p.userId) ? styles.on : ""}>
                  {canAward && (
                    <input
                      type="checkbox"
                      aria-label={`Elegir a ${p.name}`}
                      checked={selected.includes(p.userId)}
                      onChange={() => toggle(p.userId)}
                    />
                  )}
                  <span className={styles.pos}>{p.position}</span>
                  <span className={styles.who}>
                    <b>
                      {p.name}
                      {p.prizeGlints > 0 && (
                        <span className={styles.prized}>
                          <Glint /> +{number(p.prizeGlints)} de premio
                        </span>
                      )}
                    </b>
                    <small>
                      <em>{p.alias}</em> · {p.email}
                    </small>
                  </span>
                  <span className={`${styles.val} ${board === "glints" ? styles.glintVal : ""}`}>
                    {number(p.value)}
                    <small>{p.value === 1 && info.one ? info.one : info.unit}</small>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className={styles.history}>
        <h2>Temporadas anteriores</h2>
        <p>
          Al cerrar una temporada queda una foto del top 10 de cada tabla. No se borra nada de nadie: los alumnos siguen con su
          XP, sus estrellas y sus destellos.
        </p>
        {seasons && seasons.past.length === 0 && <p className={styles.none}>Todavía no se cerró ninguna temporada.</p>}
        <ul className={styles.past}>
          {seasons?.past.map((s) => (
            <li key={s.id}>
              <details>
                <summary>
                  <b>{s.name}</b>
                  <span>
                    {dayMonth(s.startedAt)} – {dayMonth(s.endedAt)}
                    {s.closedBy ? ` · la cerró ${firstName(s.closedBy)}` : ""}
                  </span>
                </summary>
                <div className={styles.podium}>
                  {BOARDS.map((b) => (
                    <div key={b.id}>
                      <h3>{b.name}</h3>
                      {s.boards[b.id].length === 0 ? (
                        <p>Sin datos</p>
                      ) : (
                        <ol>
                          {s.boards[b.id].slice(0, 3).map((r) => (
                            <li key={r.position}>
                              <b>{r.name}</b> · {number(r.value)}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      {canAward && selected.length > 0 && (
        <div className={styles.dock} role="region" aria-label="Premiar">
          <p>
            <b>{selected.length}</b> {selected.length === 1 ? "elegido" : "elegidos"}: {picked.map((p) => firstName(p.name)).join(", ")}
          </p>
          <button type="button" className={person.button} onClick={() => setSelected([])}>
            Soltar
          </button>
          <button type="button" className={`${person.button} ${person.primary}`} onClick={() => setPrizing(true)}>
            Premiar…
          </button>
        </div>
      )}

      {prizing && (
        <PrizeDialog
          board={board}
          people={picked}
          onClose={() => setPrizing(false)}
          onDone={(message) => {
            setPrizing(false);
            changed(message);
          }}
        />
      )}
      {closing && seasons && (
        <CloseSeasonDialog
          current={seasons.current}
          suggested={`Temporada ${seasons.past.length + 2}`}
          onClose={() => setClosing(false)}
          onDone={(message) => {
            setClosing(false);
            show("xp", "week");
            changed(message);
          }}
        />
      )}
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
