import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import { formatMoment } from "../../lib/time";
import type { ExamInfo, ExamProgress } from "../../types";
import { Countdown } from "./Countdown";
import { Dome } from "./Dome";
import { ExamResult } from "./ExamResult";
import { ExamRun } from "./ExamRun";
import styles from "./ExamPage.module.css";

type Question = Extract<ExamProgress, { status: "question" }>;
type Result = Extract<ExamProgress, { status: "finished" }>;

// Lo que se ve: la portada (cerrada o lista), el examen en curso o el resultado
type View =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "cover"; info: ExamInfo }
  | { kind: "run"; info: ExamInfo; progress: Question }
  | { kind: "result"; info: ExamInfo; result: Result; fresh: boolean };

// Pide el examen y, si tiene un intento en curso o terminado, ese intento
async function loadView(starId: string): Promise<View> {
  const info = await api<ExamInfo>(`/exams/${starId}`);
  const { state } = info;
  if (state.status === "in_progress" || state.status === "passed" || state.status === "retry_wait") {
    const progress = await api<ExamProgress>(`/exam-attempts/${state.attemptId}`);
    return progress.status === "question"
      ? { kind: "run", info, progress }
      : { kind: "result", info, result: progress, fresh: false };
  }
  return { kind: "cover", info };
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />
    </svg>
  );
}

export function ExamPage() {
  const { starId } = useParams();
  const { addXp } = useAuth();
  const [view, setView] = useState<View>({ kind: "loading" });

  const reload = useCallback(() => {
    if (!starId) return;
    loadView(starId)
      .then(setView)
      .catch((err) =>
        setView({ kind: "error", message: err instanceof ApiError ? err.message : "No pudimos cargar el examen." }),
      );
  }, [starId]);

  useEffect(reload, [reload]);

  if (view.kind === "loading") {
    return (
      <p className={styles.message} role="status">
        Cargando el examen...
      </p>
    );
  }
  if (view.kind === "error") {
    return (
      <p className={styles.message} role="alert">
        {view.message} <Link to="/constellations">Volver a tus constelaciones</Link>
      </p>
    );
  }

  const { info } = view;
  const kicker = (
    <p className={styles.kicker}>
      <b>{info.star.letter}</b> {info.star.title} de {info.course.name}
    </p>
  );

  if (view.kind === "run") {
    return (
      <ExamRun
        info={info}
        initial={view.progress}
        onFinished={(result) => {
          if (result.xpGained > 0) addXp(result.xpGained);
          setView({ kind: "result", info, result, fresh: true });
          window.scrollTo(0, 0);
        }}
      />
    );
  }

  if (view.kind === "result") {
    return <ExamResult info={info} result={view.result} kicker={kicker} fresh={view.fresh} onRetryOpens={reload} />;
  }

  return (
    <Cover
      info={info}
      kicker={kicker}
      onOpens={reload}
      onStart={(progress) => {
        setView({ kind: "run", info, progress });
        window.scrollTo(0, 0);
      }}
    />
  );
}

type CoverProps = {
  info: ExamInfo;
  kicker: React.ReactNode;
  onOpens: () => void;
  onStart: (progress: Question) => void;
};

// La portada: cerrada (con la cuenta regresiva) o abierta, con las reglas
function Cover({ info, kicker, onOpens, onStart }: CoverProps) {
  const { state, rules, course } = info;
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = state.status === "open";
  const constellation = `/constellations/${course.key}`;

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const progress = await api<ExamProgress>(`/exams/${info.star.id}/attempts`, { method: "POST" });
      if (progress.status === "question") onStart(progress);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos empezar el examen. Probá de nuevo.");
      setStarting(false);
    }
  }

  const seconds = rules.secondsPerType;
  const ruleList = (
    <ul className={styles.rules}>
      <li>
        <span className={styles.fig}>{rules.questions}</span>
        <span className={styles.txt}>
          <b>preguntas nuevas</b>, sorteadas del banco del curso. No son las de las lecciones.
        </span>
      </li>
      <li>
        <span className={styles.fig}>{seconds.output} s</span>
        <span className={styles.txt}>
          <b>por pregunta</b> ({seconds.fill_blank} s para completar el hueco, {seconds.order_lines} s para ordenar
          líneas). Si se acaba, cuenta como mal.
        </span>
      </li>
      <li>
        <span className={styles.fig}>{rules.passMark}</span>
        <span className={styles.txt}>
          <b>bien para aprobar.</b> No se puede volver a una pregunta anterior.
        </span>
      </li>
      <li>
        <span className={styles.fig}>{rules.couponPercent} %</span>
        <span className={styles.txt}>
          <b>de descuento</b> en tu próximo curso de WeAreSRV si aprobás
          {rules.couponPercent === 60 ? ", por ser tu primera constelación. Las siguientes dan 40 %." : "."}
        </span>
      </li>
    </ul>
  );

  if (open) {
    return (
      <main className={styles.end}>
        <div>
          <Dome open />
          {kicker}
          <h1>La cúpula está abierta</h1>
          <p className={styles.lead}>
            Buscá un rato tranquilo: <b>una vez que empezás, el reloj no se detiene</b>, aunque cierres la pestaña.
          </p>
          {ruleList}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <Link to={constellation} className={styles.ghost}>
              Todavía no
            </Link>
            <button type="button" className={styles.go} disabled={starting} onClick={start}>
              <StarIcon />
              {starting ? "Preparando..." : "Empezar el examen"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Cerrada: le faltan lecciones, o faltan días
  const opensAt = state.status === "waiting" ? state.opensAt : null;
  return (
    <main className={styles.end}>
      <div>
        <Dome open={false} />
        {kicker}
        {opensAt ? (
          <>
            <h1>La cúpula se abre en unos días</h1>
            <p className={styles.lead}>
              Encendiste todas las lecciones. Antes del examen, dejá que lo aprendido se asiente:{" "}
              <b>repasar en estos días</b> es lo que más ayuda.
            </p>
            <Countdown until={opensAt} onDone={onOpens} />
            <p className={styles.when}>
              Se abre <b>{formatMoment(new Date(opensAt))}</b>
            </p>
          </>
        ) : (
          <>
            <h1>La cúpula todavía está cerrada</h1>
            <p className={styles.lead}>
              Encendé <b>todas las lecciones</b> de la constelación. Tres días después se abre el examen.
            </p>
          </>
        )}
        {ruleList}
        <div className={styles.actions}>
          <Link to="/" className={styles.ghost}>
            Ir al inicio
          </Link>
          <Link to={constellation} className={styles.go}>
            <StarIcon />
            Repasar las lecciones
          </Link>
        </div>
      </div>
    </main>
  );
}
