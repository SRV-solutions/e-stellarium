import { useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import { XP_PER_CHALLENGE } from "../../lib/xp";
import { MiniConstellation, type StepResult } from "../../components/MiniConstellation/MiniConstellation";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { ChoiceGame } from "../GamePage/games/ChoiceGame";
import { FillBlankGame } from "../GamePage/games/FillBlankGame";
import { OrderLinesGame } from "../GamePage/games/OrderLinesGame";
import { Verdict } from "../GamePage/Verdict/Verdict";
import { KIND } from "../GamePage/kinds";
import type {
  AnswerResponse,
  AnswerResult,
  ChallengePart,
  ChallengeResult,
  ChallengeStep,
  ChallengeVerdict,
  ChallengeView,
  StudentQuestion,
} from "../../types";
import game from "../GamePage/GamePage.module.css";
import exam from "../ExamPage/ExamRun.module.css";

// Cuándo vence la pregunta, en el reloj de este navegador: ahora + lo que dice el servidor que queda
function withEnd(step: ChallengeStep) {
  return { step, endAt: Date.now() + step.remainingMs };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toStep = (correct: boolean | null): StepResult | undefined =>
  correct === null ? undefined : correct ? "ok" : "bad";

const PART: Record<ChallengePart, string> = { own: "Tus cursos", explore: "Explorá", discover: "Descubrí" };

type Props = {
  view: ChallengeView & { current: ChallengeStep };
  title: string; // "Desafío del lunes 9"
  onFinished: (result: ChallengeResult) => void;
  onLeave: () => void;
};

export function ChallengeRun({ view, title, onFinished, onLeave }: Props) {
  const { addXp, noteActivity } = useAuth();
  const id = view.challenge.id;
  const [{ step, endAt }, setCurrent] = useState(() => withEnd(view.current));
  const [now, setNow] = useState(() => Date.now());
  const [results, setResults] = useState(() => view.questions.map((q) => toStep(q.correct)));
  const [response, setResponse] = useState<AnswerResponse | null>(null);
  const [verdict, setVerdict] = useState<ChallengeVerdict | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  // El reloj de la pregunta: se actualiza 10 veces por segundo. Se frena mientras se lee el veredicto
  useEffect(() => {
    if (verdict) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [verdict]);

  const left = Math.max(0, endAt - now);
  const timeUp = left === 0 && !verdict;
  const seconds = Math.ceil(left / 1000);
  const { question, position, total, timeLimitSeconds, part } = step;
  // Los juegos son los de las estrellas: les completamos los campos que el desafío no usa
  const shown = { ...question, attempt: 0, solved: false } as StudentQuestion;
  const where = part === "explore" && view.explore ? `Explorá: ${view.explore.name}` : PART[part];

  // El veredicto en la forma que esperan los juegos. Arriba se muestra solo el XP de la pregunta;
  // lo de terminar el desafío va en la pantalla final
  const result: AnswerResult | null = verdict && {
    correct: verdict.correct,
    solution: verdict.solution ?? { choice: -1 },
    output: verdict.output,
    explanation: verdict.explanation,
    xpGained: verdict.xpGained - (verdict.finished ? XP_PER_CHALLENGE : 0),
    starXp: 0,
    starCompleted: false,
  };
  // Si se le venció, no hay solución para marcar en el juego
  const gameResult = verdict?.solution ? result : null;

  // Si no la supo, dónde se aprende: el desafío es para animarse a lo que todavía no vio
  const learn = verdict?.learnAt;
  const hint =
    verdict && !verdict.correct && learn
      ? learn.owned
        ? `No pasa nada: esto lo ves en el módulo ${learn.module} de ${learn.course.name}, ${learn.title} (clases ${learn.classes}).`
        : `Esto se ve en ${learn.course.name}, módulo ${learn.module}: ${learn.title}. Es un curso que todavía no tenés.`
      : undefined;

  function mark(index: number, correct: boolean) {
    setResults((previous) => {
      const next = [...previous];
      next[index] = correct ? "ok" : "bad";
      return next;
    });
  }

  async function answer() {
    if (!response || sending) return;
    setSending(true);
    setError(null);
    try {
      const graded = await api<ChallengeVerdict>(`/challenges/${id}/answer`, {
        method: "POST",
        body: JSON.stringify({ position, response }),
      });
      setVerdict(graded);
      mark(position - 1, graded.correct);
      if (graded.xpGained > 0) addXp(graded.xpGained);
      noteActivity(); // si era lo primero del día, la racha cambió
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos comprobar tu respuesta. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  // La que sigue se pide recién ahora: su reloj arranca cuando aparece. Si se acabó el tiempo, el
  // servidor espera un par de segundos (por si la respuesta venía en camino), así que si todavía
  // devuelve la misma, esperamos y volvemos a pedir
  async function next() {
    if (sending) return;
    if (verdict?.finished && verdict.result) {
      onFinished(verdict.result);
      return;
    }
    setSending(true);
    setError(null);
    try {
      for (let i = 0; i < 5; i++) {
        const fresh = await api<ChallengeView>("/challenges/current");
        if (fresh.status === "finished" && fresh.result) {
          onFinished(fresh.result);
          return;
        }
        if (fresh.current && fresh.current.position !== position) {
          setResults(fresh.questions.map((q) => toStep(q.correct)));
          setVerdict(null);
          setResponse(null);
          setCurrent(withEnd(fresh.current));
          setNow(Date.now());
          return;
        }
        await wait(1000);
      }
      throw new ApiError(500, "No pudimos pasar a la siguiente pregunta. Probá de nuevo.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos conectarnos. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={game.page}>
      <header className={game.wrap}>
        <div className={`${game.top} ${exam.top}`}>
          <button type="button" className={game.close} aria-label="Salir del desafío" onClick={() => setLeaving(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <MiniConstellation total={total} current={position - 1} results={results} />
          <div className={`${exam.clock} ${seconds <= 10 ? exam.low : ""}`} role="timer" aria-live="off">
            <svg viewBox="0 0 64 64">
              <circle className={exam.track} cx="32" cy="32" r="28" />
              <circle
                className={exam.left}
                cx="32"
                cy="32"
                r="28"
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={1 - left / (timeLimitSeconds * 1000)}
              />
            </svg>
            <b>{seconds}</b>
          </div>
        </div>
        <p className={game.where}>
          {title}, pregunta {position} de {total} · {where}
        </p>
      </header>

      <main className={game.wrap}>
        <div className={`${game.stage} ${timeUp ? exam.frozen : ""}`} key={question.id}>
          <p className={game.kind}>{KIND[question.type]}</p>
          <h1 className={game.prompt}>{question.prompt}</h1>
          {(shown.type === "output" || shown.type === "multiple_choice") && (
            <ChoiceGame
              question={shown}
              response={response as { choice: number } | null}
              onChange={setResponse}
              result={gameResult}
            />
          )}
          {shown.type === "fill_blank" && <FillBlankGame question={shown} onChange={setResponse} result={gameResult} />}
          {shown.type === "order_lines" && <OrderLinesGame question={shown} onChange={setResponse} result={gameResult} />}
        </div>
      </main>

      {result ? (
        <Verdict
          result={result}
          onNext={next}
          missTitle={verdict!.timedOut ? "Se terminó el tiempo" : "Casi. Puede volver en otro desafío"}
          hint={hint}
        />
      ) : timeUp ? (
        // Se acabó el tiempo antes de responder: cuenta como mal
        <div className={exam.sheet} role="alert">
          <div className={`${game.wrap} ${exam.sheetWrap}`}>
            <div className={exam.badge}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />
              </svg>
            </div>
            <div className={exam.verdict}>
              <strong>Se terminó el tiempo</strong>
              <p>Esta cuenta como mal. Puede volver en otro desafío.</p>
              {error && <p role="alert">{error}</p>}
            </div>
            <button type="button" className={exam.next} disabled={sending} onClick={next}>
              {sending ? "Un momento..." : position === total ? "Ver el resultado" : "Siguiente pregunta"}
            </button>
          </div>
        </div>
      ) : (
        <div className={game.dock}>
          <div className={`${game.wrap} ${exam.dockWrap}`}>
            {error ? (
              <p className={game.error} role="alert">
                {error}
              </p>
            ) : (
              <span className={exam.noBack}>Un solo intento: al comprobar no hay vuelta atrás.</span>
            )}
            <button type="button" className={game.go} disabled={response === null || sending} onClick={answer}>
              {sending ? "Comprobando..." : "Comprobar"}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={leaving}
        title="¿Salir del desafío?"
        cancelLabel="Seguir jugando"
        confirmLabel="Salir igual"
        onCancel={() => setLeaving(false)}
        onConfirm={onLeave}
      >
        El reloj de la pregunta que tenés abierta sigue corriendo. Las que no respondas a tiempo cuentan como mal.
      </ConfirmDialog>
    </div>
  );
}
