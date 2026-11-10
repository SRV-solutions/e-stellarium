import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import { burst, centerOf, travel } from "../../lib/effects";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { MiniConstellation, type StepResult } from "../../components/MiniConstellation/MiniConstellation";
import { ChoiceGame } from "../GamePage/games/ChoiceGame";
import { FillBlankGame } from "../GamePage/games/FillBlankGame";
import { OrderLinesGame } from "../GamePage/games/OrderLinesGame";
import { Verdict } from "../GamePage/Verdict/Verdict";
import { KIND } from "../GamePage/kinds";
import { ReviewDone } from "./ReviewDone";
import type { AnswerResponse, AnswerResult, Review, ReviewAnswer, StudentQuestion } from "../../types";
import styles from "../GamePage/GamePage.module.css";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; review: Review | null };

export function ReviewPage() {
  const [state, setState] = useState<State>({ status: "loading" });

  // Pedirlo lo arma, si es la primera vez que lo abre hoy
  useEffect(() => {
    let cancelled = false;
    api<{ review: Review | null }>("/review/today")
      .then((d) => !cancelled && setState({ status: "ready", review: d.review }))
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : "No pudimos cargar el repaso.";
        setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <p className={styles.message} role="status">
        Armando tu repaso...
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p className={styles.message} role="alert">
        {state.message} <Link to="/">Volver al inicio</Link>
      </p>
    );
  }
  if (!state.review) {
    return (
      <p className={styles.message}>
        Todavía no hay repaso: aparece cuando jugás tu primera estrella. <Link to="/">Volver al inicio</Link>
      </p>
    );
  }
  return <ReviewGame review={state.review} />;
}

function ReviewGame({ review }: { review: Review }) {
  const { addXp, noteActivity } = useAuth();
  const { questions } = review;
  // Lo que ya respondió (si lo dejó a medias) queda marcado; se juegan solo las otras, en orden
  const [results, setResults] = useState<(StepResult | undefined)[]>(() =>
    questions.map((q) => (q.correct === null ? undefined : q.correct ? "ok" : "bad")),
  );
  const [round] = useState(() => questions.flatMap((q, i) => (q.answered ? [] : [i])));
  const [step, setStep] = useState(0);
  const [landing, setLanding] = useState<number | null>(null);
  const [xp, setXp] = useState(0);
  // El XP de arriba suma recién cuando la chispa llega a su estrellita, y cuenta hacia arriba
  const [headerXp, setHeaderXp] = useState(0);
  const shownXp = useAnimatedNumber(headerXp);
  const [response, setResponse] = useState<AnswerResponse | null>(null);
  const [answer, setAnswer] = useState<ReviewAnswer | null>(null);
  const [last, setLast] = useState<ReviewAnswer | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(review.finished);

  if (finished) {
    return (
      <ReviewDone
        correctCount={last?.correctCount ?? review.correctCount}
        total={review.total}
        xp={xp}
        streak={last?.streak ?? null}
      />
    );
  }

  const index = round[step]!;
  const item = questions[index]!;
  // Los juegos esperan una pregunta de estrella: el repaso no usa attempt ni solved
  const question = { ...item.question, attempt: 0, solved: false } as StudentQuestion;
  // Y un resultado de estrella: en el repaso no hay estrella que encender. El veredicto muestra solo
  // lo de la pregunta; lo de terminar el repaso se muestra en la pantalla final
  const result: AnswerResult | null = answer && {
    ...answer,
    xpGained: answer.xpGained - answer.reviewXp,
    starXp: 0,
    starCompleted: false,
  };

  async function check() {
    if (!response || checking) return;
    setChecking(true);
    setError(null);
    try {
      const graded = await api<ReviewAnswer>(`/reviews/${review.id}/answer`, {
        method: "POST",
        body: JSON.stringify({ position: item.position, response }),
      });
      // flushSync aplica estos cambios ya, así la pantalla muestra el veredicto antes de animar
      flushSync(() => {
        setAnswer(graded);
        setLast(graded);
        setResults((previous) => {
          const next = [...previous];
          next[index] = graded.correct ? "ok" : "bad";
          return next;
        });
        setLanding(index);
        setXp((previous) => previous + graded.xpGained);
      });
      if (graded.xpGained > 0) addXp(graded.xpGained);
      noteActivity();
      // Arriba suma solo lo de la pregunta; lo de terminar el repaso se muestra en la pantalla final
      animateVerdict(graded.correct, index, graded.xpGained - graded.reviewXp);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos comprobar tu respuesta. Probá de nuevo.");
    } finally {
      setChecking(false);
    }
  }

  // Igual que en las estrellas: si acertó, una chispa viaja hasta su estrellita y la enciende
  function animateVerdict(correct: boolean, landed: number, gained: number) {
    const land = () => {
      setLanding((current) => (current === landed ? null : current));
      if (gained > 0) setHeaderXp((previous) => previous + gained);
    };
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
    if (step + 1 >= round.length) setFinished(true);
    else setStep(step + 1);
  }

  return (
    <div className={styles.page}>
      <header className={styles.wrap}>
        <div className={styles.top}>
          <Link to="/" className={styles.close} aria-label="Salir del repaso">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
          <MiniConstellation
            total={questions.length}
            current={index}
            results={results.map((r, i) => (i === landing ? undefined : r))}
          />
          {/* key: cada vez que sube, el elemento se crea de nuevo y el salto se repite */}
          <span key={headerXp} className={`${styles.xp} ${headerXp > 0 ? styles.bump : ""}`}>
            +{shownXp} XP
          </span>
        </div>
        <p className={styles.where}>
          Repaso del día, pregunta {item.position} de {questions.length}
        </p>
      </header>

      <main className={styles.wrap}>
        <div className={styles.stage} key={item.position}>
          <p className={styles.kind}>{KIND[question.type]}</p>
          <h1 className={styles.prompt}>{question.prompt}</h1>
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
        <Verdict result={result} onNext={next} missTitle="Casi. Va a volver en otro repaso" />
      ) : (
        <div className={styles.dock}>
          <div className={styles.wrap}>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <button type="button" className={styles.go} disabled={response === null || checking} onClick={check}>
              {checking ? "Comprobando..." : "Comprobar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
