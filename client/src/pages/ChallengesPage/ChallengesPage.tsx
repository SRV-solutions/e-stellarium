import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "../../components/AppHeader/AppHeader";
import { Cosmos } from "../../components/Cosmos/Cosmos";
import { api, ApiError } from "../../lib/api";
import { XP_PER_CHALLENGE, XP_PER_CHALLENGE_ANSWER } from "../../lib/xp";
import type { ChallengeResult, ChallengeStep, ChallengeView, Ranking } from "../../types";
import { ChallengeDone } from "./ChallengeDone";
import { ChallengeRoute } from "./ChallengeRoute";
import { ChallengeRun } from "./ChallengeRun";
import { RankingBoard } from "./RankingBoard";
import styles from "./ChallengesPage.module.css";

const TIME_ZONE = "America/Argentina/Buenos_Aires";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// "lunes 9"
function dayName(date: Date) {
  return date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", timeZone: TIME_ZONE }).replace(",", "");
}

// "3 d 14 h", o "5 h 20 min" si falta menos de un día
function timeLeft(ms: number) {
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / 60000);
  return days > 0 ? `${days} d ${hours} h` : `${hours} h ${minutes} min`;
}

type Mode =
  | { screen: "page" }
  | { screen: "run"; view: ChallengeView & { current: ChallengeStep } }
  | { screen: "done"; result: ChallengeResult };

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; view: ChallengeView };

export function ChallengesPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [period, setPeriod] = useState<Ranking["period"]>("week");
  const [mode, setMode] = useState<Mode>({ screen: "page" });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pedir el desafío lo arma, si es la primera vez que lo abre
  const loadChallenge = useCallback(() => {
    api<ChallengeView>("/challenges/current")
      .then((view) => setState({ status: "ready", view }))
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : "No pudimos cargar el desafío.";
        setState({ status: "error", message });
      });
  }, []);

  useEffect(loadChallenge, [loadChallenge]);

  useEffect(() => {
    let cancelled = false;
    api<Ranking>(`/ranking?period=${period}`)
      .then((r) => !cancelled && setRanking(r))
      .catch(() => !cancelled && setRanking({ period, startsAt: null, endsAt: null, top: [], me: null }));
    return () => {
      cancelled = true;
    };
  }, [period, mode.screen]);

  function changePeriod(next: Ranking["period"]) {
    setRanking(null);
    setPeriod(next);
  }

  // Empezar (o seguir, si lo dejó a medias): el reloj arranca con la primera pregunta
  async function play(view: ChallengeView) {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const fresh =
        view.status === "ready"
          ? await api<ChallengeView>(`/challenges/${view.challenge.id}/start`, { method: "POST" })
          : await api<ChallengeView>("/challenges/current");
      if (fresh.current) setMode({ screen: "run", view: fresh as ChallengeView & { current: ChallengeStep } });
      else {
        setState({ status: "ready", view: fresh });
        if (fresh.result) setMode({ screen: "done", result: fresh.result });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos empezar el desafío. Probá de nuevo.");
    } finally {
      setStarting(false);
    }
  }

  function backToPage() {
    setMode({ screen: "page" });
    loadChallenge();
  }

  const title = state.status === "ready" ? `Desafío del ${dayName(new Date(state.view.challenge.publishedAt))}` : "";

  if (mode.screen === "run") {
    return <ChallengeRun view={mode.view} title={title} onFinished={(result) => setMode({ screen: "done", result })} onLeave={backToPage} />;
  }

  return (
    <>
      <Cosmos />
      <AppHeader />
      {mode.screen === "done" ? (
        <ChallengeDone
          result={mode.result}
          title={title}
          discover={state.status === "ready" ? (state.view.discover?.name ?? null) : null}
          onRanking={backToPage}
        />
      ) : (
        <main className={styles.page}>
          <section>
            {state.status === "loading" && (
              <p className={styles.lead} role="status">
                Armando tu desafío...
              </p>
            )}
            {state.status === "error" && (
              <p className={styles.lead} role="alert">
                {state.message}
              </p>
            )}
            {state.status === "ready" && (
              <Panel view={state.view} title={title} starting={starting} error={error} onPlay={() => play(state.view)} />
            )}
          </section>
          <RankingBoard ranking={ranking} period={period} onPeriod={changePeriod} />
        </main>
      )}
    </>
  );
}

type PanelProps = { view: ChallengeView; title: string; starting: boolean; error: string | null; onPlay: () => void };

// El desafío de esta semana: cuándo salió y cuándo cierra, sus preguntas y el botón para jugarlo
function Panel({ view, title, starting, error, onPlay }: PanelProps) {
  const published = new Date(view.challenge.publishedAt);
  const closes = new Date(view.challenge.closesAt);
  const next = `el ${dayName(closes)} a las 9:00`;

  if (view.status === "unavailable") {
    return (
      <>
        <p className={styles.eyebrow}>{title}</p>
        <h1 className={styles.title}>Tu desafío se está armando</h1>
        <p className={styles.lead}>
          Todavía no hay preguntas de desafío para tus cursos. Mientras tanto, el repaso del día mantiene tu racha.
        </p>
        <TimeRule published={published} closes={closes} />
      </>
    );
  }

  const right = view.questions.filter((q) => q.correct).length;
  const answered = view.questions.filter((q) => q.correct !== null).length;
  const others = view.parts.explore + view.parts.discover;
  const current = view.status === "in_progress" ? answered : undefined;

  return (
    <>
      <p className={styles.eyebrow}>{title}</p>
      <h1 className={styles.title}>{view.status === "finished" ? "Desafío jugado" : "El desafío de esta semana"}</h1>
      <p className={styles.lead}>
        {view.total} preguntas armadas para vos
        {others > 0 && view.explore ? (
          <>
            : {view.parts.own} de tus cursos y{" "}
            {!view.discover || view.discover.key === view.explore.key ? (
              <>
                {others} de <b>{view.explore.name}</b>
              </>
            ) : (
              <>
                {view.parts.explore} de <b>{view.explore.name}</b> y {view.parts.discover} de <b>{view.discover.name}</b>
              </>
            )}
            , para que espíes lo que viene.
          </>
        ) : (
          ", de tus cursos."
        )}
      </p>
      <TimeRule published={published} closes={closes} />
      <div className={styles.route}>
        <ChallengeRoute
          questions={view.questions}
          explore={view.explore?.name ?? null}
          discover={view.discover?.name ?? null}
          current={current}
        />
      </div>

      {view.status === "finished" && (
        <>
          <p className={styles.done}>
            Lo jugaste: <b>{right} de {view.total}</b> bien,{" "}
            <span className={styles.xp}>+{right * XP_PER_CHALLENGE_ANSWER + XP_PER_CHALLENGE} XP</span>. El próximo sale {next}.
          </p>
          {view.explore && (
            <p className={styles.reco}>
              Las de <b>{view.explore.name}</b> son de un curso que todavía no tenés: ahí se ven a fondo.
            </p>
          )}
        </>
      )}

      {view.status === "ready" && (
        <ul className={styles.rules}>
          <li>
            <b>Un solo intento</b>
          </li>
          <li>
            <b>30 a 45 s</b> por pregunta
          </li>
          <li>
            <b>{XP_PER_CHALLENGE_ANSWER} XP</b> por acierto y <b>{XP_PER_CHALLENGE}</b> al terminarlo
          </li>
        </ul>
      )}

      {(view.status === "ready" || view.status === "in_progress") && (
        <>
          <button type="button" className={styles.go} disabled={starting} onClick={onPlay}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />
            </svg>
            {starting ? "Un momento..." : view.status === "ready" ? "Empezar el desafío" : "Seguir el desafío"}
          </button>
          {error ? (
            <p className={styles.warn} role="alert">
              {error}
            </p>
          ) : (
            <p className={styles.warn}>
              {view.status === "ready"
                ? "Una vez que empezás, el reloj no se frena."
                : `Vas ${answered} de ${view.total}. El reloj de la pregunta que dejaste siguió corriendo.`}
            </p>
          )}
        </>
      )}
    </>
  );
}

// La ventana del desafío: una regla con un palito por día, lo que ya pasó en trazo lleno y "ahora" con la mira
function TimeRule({ published, closes }: { published: Date; closes: Date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const span = closes.getTime() - published.getTime();
  const at = Math.min(1, Math.max(0, (now - published.getTime()) / span));
  const days = Math.round(span / DAY);
  const time = published.toLocaleTimeString("es-AR", { hour: "numeric", minute: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE });

  return (
    <div className={styles.window}>
      <div className={styles.rule} aria-hidden="true">
        {Array.from({ length: days + 1 }, (_, i) => (
          <span key={i} className={styles.tick} style={{ left: `${(i / days) * 100}%` }} />
        ))}
        <span className={styles.past} style={{ width: `${at * 100}%` }} />
        <span className={styles.now} style={{ left: `${at * 100}%` }} />
      </div>
      <div className={styles.ends}>
        <span>
          Salió el {dayName(published)}, {time}
        </span>
        <span>
          Cierra en <b>{timeLeft(Math.max(0, closes.getTime() - now))}</b>
        </span>
      </div>
    </div>
  );
}
