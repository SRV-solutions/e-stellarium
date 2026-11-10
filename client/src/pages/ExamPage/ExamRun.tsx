import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import { greekLetter } from "../../lib/sky";
import type { AnswerResponse, ExamInfo, ExamProgress, StudentQuestion } from "../../types";
import game from "../GamePage/GamePage.module.css";
import { ChoiceGame } from "../GamePage/games/ChoiceGame";
import { FillBlankGame } from "../GamePage/games/FillBlankGame";
import { OrderLinesGame } from "../GamePage/games/OrderLinesGame";
import { KIND } from "../GamePage/kinds";
import styles from "./ExamRun.module.css";

type Question = Extract<ExamProgress, { status: "question" }>;

// Cuándo vence la pregunta, en el reloj de este navegador: ahora + lo que dice el servidor que queda
function withEnd(progress: Question) {
  return { progress, endAt: Date.now() + progress.remainingMs };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Props = {
  info: ExamInfo;
  initial: Question;
  onFinished: (result: Extract<ExamProgress, { status: "finished" }>) => void;
};

export function ExamRun({ info, initial, onFinished }: Props) {
  const navigate = useNavigate();
  const [{ progress, endAt }, setCurrent] = useState(() => withEnd(initial));
  const [now, setNow] = useState(() => Date.now());
  const [response, setResponse] = useState<AnswerResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leave = useRef<HTMLDialogElement>(null);
  const { noteActivity } = useAuth();

  // El reloj de la pregunta: se actualiza 10 veces por segundo
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, endAt - now);
  const timeUp = left === 0;
  const seconds = Math.ceil(left / 1000);
  const { question, position, total, timeLimitSeconds } = progress;
  // Los juegos son los mismos de las estrellas: les completamos los campos que el examen no usa
  const shown = { ...question, attempt: 0, solved: false } as StudentQuestion;

  // Lo que manda el servidor: la siguiente pregunta o el resultado
  function show(next: ExamProgress) {
    if (next.status === "finished") {
      onFinished(next);
      return;
    }
    setResponse(null);
    setCurrent(withEnd(next));
    setNow(Date.now());
  }

  async function run(request: () => Promise<ExamProgress>) {
    setSending(true);
    setError(null);
    try {
      show(await request());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos conectarnos. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  function answer() {
    if (!response || sending) return;
    run(async () => {
      const next = await api<ExamProgress>(`/exam-attempts/${progress.attemptId}/answer`, {
        method: "POST",
        body: JSON.stringify({ position, response }),
      });
      noteActivity(); // si era lo primero del día, la racha cambió
      return next;
    });
  }

  // Después de que se acaba el tiempo, se le pide al servidor la que sigue. El servidor espera
  // un par de segundos más (por si la respuesta venía en camino), así que si todavía devuelve
  // la misma pregunta, esperamos un segundo y volvemos a pedir
  function nextAfterTimeout() {
    run(async () => {
      for (let i = 0; i < 5; i++) {
        const next = await api<ExamProgress>(`/exam-attempts/${progress.attemptId}`);
        if (next.status === "finished" || next.position !== position) return next;
        await wait(1000);
      }
      throw new ApiError(500, "No pudimos pasar a la siguiente pregunta. Probá de nuevo.");
    });
  }

  return (
    <div className={game.page}>
      <header className={game.wrap}>
        <div className={`${game.top} ${styles.top}`}>
          <button
            type="button"
            className={game.close}
            aria-label="Salir del examen"
            onClick={() => leave.current?.showModal()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <div className={styles.ticks} role="img" aria-label={`Pregunta ${position} de ${total}`}>
            {Array.from({ length: total }, (_, i) => (
              <i key={i} className={i + 1 < position ? styles.done : i + 1 === position ? styles.now : ""} />
            ))}
          </div>

          <div className={`${styles.clock} ${seconds <= 10 ? styles.low : ""}`} role="timer" aria-live="off">
            <svg viewBox="0 0 64 64">
              <circle className={styles.track} cx="32" cy="32" r="28" />
              <circle
                className={styles.left}
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
          <b>{greekLetter(info.star.position - 1)}</b>
          {info.star.title}, pregunta {position} de {total} <em className={styles.keepsGoing}>· si salís, el reloj sigue</em>
        </p>
      </header>

      <main className={game.wrap}>
        <div className={`${game.stage} ${timeUp ? styles.frozen : ""}`} key={question.id}>
          <p className={game.kind}>{KIND[question.type]}</p>
          <h1 className={game.prompt}>{question.prompt}</h1>
          {(shown.type === "output" || shown.type === "multiple_choice") && (
            <ChoiceGame
              question={shown}
              response={response as { choice: number } | null}
              onChange={setResponse}
              result={null}
            />
          )}
          {shown.type === "fill_blank" && <FillBlankGame question={shown} onChange={setResponse} result={null} />}
          {shown.type === "order_lines" && <OrderLinesGame question={shown} onChange={setResponse} result={null} />}
        </div>
      </main>

      {timeUp ? (
        // Se acabó el tiempo: la misma hoja del veredicto, sin decir si estaba bien
        <div className={styles.sheet} role="alert">
          <div className={`${game.wrap} ${styles.sheetWrap}`}>
            <div className={styles.badge}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />
              </svg>
            </div>
            <div className={styles.verdict}>
              <strong>Se terminó el tiempo</strong>
              <p>Esta cuenta como no respondida. En el examen no se muestran las respuestas hasta el final.</p>
              {error && <p role="alert">{error}</p>}
            </div>
            <button type="button" className={styles.next} disabled={sending} onClick={nextAfterTimeout}>
              {sending ? "Un momento..." : position === total ? "Ver el resultado" : "Siguiente pregunta"}
            </button>
          </div>
        </div>
      ) : (
        <div className={game.dock}>
          <div className={`${game.wrap} ${styles.dockWrap}`}>
            {error ? (
              <p className={game.error} role="alert">
                {error}
              </p>
            ) : (
              <span className={styles.noBack}>Al responder pasás a la siguiente, sin vuelta atrás.</span>
            )}
            <button
              type="button"
              className={game.go}
              disabled={response === null || sending}
              onClick={answer}
            >
              {sending ? "Enviando..." : "Responder"}
            </button>
          </div>
        </div>
      )}

      <dialog ref={leave} className={styles.leave} aria-labelledby="leave-title">
        <h2 id="leave-title">¿Salir del examen?</h2>
        <p>
          El reloj sigue corriendo aunque te vayas. Las preguntas que no respondas a tiempo cuentan como mal.
        </p>
        <div className={styles.leaveActions}>
          <button type="button" className={styles.stay} onClick={() => leave.current?.close()}>
            Seguir rindiendo
          </button>
          <button
            type="button"
            className={styles.exit}
            onClick={() => navigate(`/constellations/${info.course.key}`)}
          >
            Salir igual
          </button>
        </div>
      </dialog>
    </div>
  );
}
