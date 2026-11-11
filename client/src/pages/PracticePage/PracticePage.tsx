import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useParams } from "react-router";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import { burst, centerOf, travel } from "../../lib/effects";
import { MiniConstellation, type StepResult } from "../../components/MiniConstellation/MiniConstellation";
import { ChoiceGame } from "../GamePage/games/ChoiceGame";
import { FillBlankGame } from "../GamePage/games/FillBlankGame";
import { OrderLinesGame } from "../GamePage/games/OrderLinesGame";
import { Verdict } from "../GamePage/Verdict/Verdict";
import { KIND } from "../GamePage/kinds";
import { PracticeDone } from "./PracticeDone";
import type { AnswerResponse, AnswerResult, ExamInfo, Practice, PracticeAnswer, StudentQuestion } from "../../types";
import gameStyles from "../GamePage/GamePage.module.css";
import styles from "./PracticePage.module.css";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; info: ExamInfo; practice: Practice };

// La práctica del examen aprobado: 10 preguntas del curso, sin reloj, sin XP. Cada vez, otras
export function PracticePage() {
  const { starId } = useParams();
  const [state, setState] = useState<State>({ status: "loading" });
  // Cada vez que sube, se arma una práctica nueva ("Practicar otra vez")
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<ExamInfo>(`/exams/${starId}`),
      api<Practice>(`/exams/${starId}/practice`, { method: "POST" }),
    ])
      .then(([info, practice]) => !cancelled && setState({ status: "ready", info, practice }))
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : "No pudimos armar la práctica.";
        setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [starId, round]);

  if (state.status === "loading") {
    return (
      <p className={gameStyles.message} role="status">
        Armando tu práctica...
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p className={gameStyles.message} role="alert">
        {state.message} <Link to="/">Volver al inicio</Link>
      </p>
    );
  }
  return (
    <PracticeGame
      key={state.practice.practiceId}
      info={state.info}
      practice={state.practice}
      onAgain={() => {
        setState({ status: "loading" });
        setRound((r) => r + 1);
      }}
    />
  );
}

type GameProps = { info: ExamInfo; practice: Practice; onAgain: () => void };

function PracticeGame({ info, practice, onAgain }: GameProps) {
  const { noteActivity } = useAuth();
  const { questions } = practice;
  const [results, setResults] = useState<(StepResult | undefined)[]>(() => questions.map(() => undefined));
  const [step, setStep] = useState(0);
  const [landing, setLanding] = useState<number | null>(null);
  const [response, setResponse] = useState<AnswerResponse | null>(null);
  const [answer, setAnswer] = useState<PracticeAnswer | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const constellation = `/constellations/${info.course.key}`;

  if (finished) {
    return (
      <PracticeDone
        correctCount={results.filter((r) => r === "ok").length}
        total={questions.length}
        constellation={constellation}
        onAgain={onAgain}
      />
    );
  }

  // Los juegos esperan una pregunta de estrella: la práctica no usa attempt ni solved
  const question = { ...questions[step]!, attempt: 0, solved: false } as StudentQuestion;
  // Y un resultado de estrella: en la práctica no hay XP ni estrella que encender
  const result: AnswerResult | null = answer && { ...answer, xpGained: 0, starXp: 0, starCompleted: false };

  async function check() {
    if (!response || checking) return;
    setChecking(true);
    setError(null);
    try {
      const graded = await api<PracticeAnswer>(`/exams/${info.star.id}/practice/answer`, {
        method: "POST",
        body: JSON.stringify({ practiceId: practice.practiceId, questionId: question.id, response }),
      });
      // flushSync aplica estos cambios ya, así la pantalla muestra el veredicto antes de animar
      flushSync(() => {
        setAnswer(graded);
        setResults((previous) => {
          const next = [...previous];
          next[step] = graded.correct ? "ok" : "bad";
          return next;
        });
        setLanding(step);
      });
      noteActivity();
      animateVerdict(graded.correct, step);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos comprobar tu respuesta. Probá de nuevo.");
    } finally {
      setChecking(false);
    }
  }

  // Igual que en las estrellas: si acertó, una chispa viaja hasta su estrellita y la enciende
  function animateVerdict(correct: boolean, landed: number) {
    const land = () => setLanding((current) => (current === landed ? null : current));
    const origin = document.querySelector("[data-answer]");
    const target = document.querySelector(`[data-step="${landed}"]`);
    if (!correct) {
      setTimeout(land, 350);
      return;
    }
    if (!origin || !target) {
      land();
      return;
    }
    burst(centerOf(origin), "#bdf5dc");
    travel(centerOf(origin), centerOf(target), () => {
      land();
      burst(centerOf(target), "#ffffff", 10);
    });
  }

  function next() {
    setResponse(null);
    setAnswer(null);
    setLanding(null);
    if (step + 1 >= questions.length) setFinished(true);
    else setStep(step + 1);
  }

  return (
    <div className={gameStyles.page}>
      <header className={gameStyles.wrap}>
        <div className={gameStyles.top}>
          <Link to={constellation} className={gameStyles.close} aria-label="Salir de la práctica">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
          <MiniConstellation
            total={questions.length}
            current={step}
            results={results.map((r, i) => (i === landing ? undefined : r))}
          />
          <span className={styles.free}>Sin reloj</span>
        </div>
        <p className={gameStyles.where}>
          <b className={styles.kicker}>Práctica del examen</b>, pregunta {step + 1} de {questions.length}
        </p>
      </header>

      <main className={gameStyles.wrap}>
        <div className={gameStyles.stage} key={question.id}>
          <p className={gameStyles.kind}>{KIND[question.type]}</p>
          <h1 className={gameStyles.prompt}>{question.prompt}</h1>
          {(question.type === "output" || question.type === "multiple_choice") && (
            <ChoiceGame
              question={question}
              response={response as { choice: number } | null}
              onChange={setResponse}
              result={result}
            />
          )}
          {question.type === "fill_blank" && <FillBlankGame question={question} onChange={setResponse} result={result} />}
          {question.type === "order_lines" && (
            <OrderLinesGame question={question} onChange={setResponse} result={result} />
          )}
        </div>
      </main>

      {result ? (
        <Verdict result={result} onNext={next} missTitle="No era esa" />
      ) : (
        <div className={gameStyles.dock}>
          <div className={gameStyles.wrap}>
            {error && (
              <p className={gameStyles.error} role="alert">
                {error}
              </p>
            )}
            <button type="button" className={gameStyles.go} disabled={response === null || checking} onClick={check}>
              {checking ? "Comprobando..." : "Comprobar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
