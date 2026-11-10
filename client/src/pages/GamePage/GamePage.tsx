import { useState } from "react";
import { flushSync } from "react-dom";
import { Link, useParams } from "react-router";
import { useStar } from "../../hooks/useStar";
import { useAuth } from "../../auth/useAuth";
import { burst, centerOf, travel } from "../../lib/effects";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import {
  MiniConstellation,
  type StepResult,
} from "../../components/MiniConstellation/MiniConstellation";
import styles from "./GamePage.module.css";
import { ChoiceGame } from "./games/ChoiceGame";
import { FillBlankGame } from "./games/FillBlankGame";
import { OrderLinesGame } from "./games/OrderLinesGame";
import { api, ApiError } from "../../lib/api";
import { Verdict } from "./Verdict/Verdict";
import { KIND } from "./kinds";
import { StarLit } from "./StarLit/StarLit";
import { StarReplay } from "./StarReplay/StarReplay";
import { StarUnfinished } from "./StarUnfinished/StarUnfinished";
import type { AnswerResponse, AnswerResult, StarPlay } from "../../types";

export function GamePage() {
  const { starId } = useParams();
  const state = useStar(starId);

  if (state.status === "loading") {
    return (
      <p className={styles.message} role="status">
        Cargando la estrella...
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p className={styles.message} role="alert">
        {state.message}{" "}
        <Link to="/constellations">Volver a tus constelaciones</Link>
      </p>
    );
  }

  return <Game key={state.play.star.id} play={state.play} />;
}

function Game({ play: initialPlay }: { play: StarPlay }) {
  // play se reemplaza al reintentar: trae los intentos nuevos y, con ellos, otra mezcla
  const [play, setPlay] = useState(initialPlay);
  const { addXp, noteActivity } = useAuth();
  const { star, questions, course, nextStar } = play;
  // Si la dejó a medias, sigue donde quedó: las que ya acertó cuentan y se juegan solo las otras.
  // Una estrella ya encendida se repasa entera
  const [start] = useState(() => {
    const pending = questions.flatMap((q, i) => (q.solved ? [] : [i]));
    const resume = !star.completed && pending.length > 0 && pending.length < questions.length;
    const solved: StepResult[] = [];
    if (resume) questions.forEach((q, i) => q.solved && (solved[i] = "ok"));
    return { resume, round: resume ? pending : questions.map((_, i) => i), solved };
  });
  // round: las posiciones de las preguntas que se juegan en esta vuelta. step: cuál de ellas va
  const [round, setRound] = useState(start.round);
  const [step, setStep] = useState(0);
  const [intro, setIntro] = useState(start.resume);
  const [isRetry, setIsRetry] = useState(false);
  const [results, setResults] = useState<StepResult[]>(start.solved);
  // La pregunta recién respondida cuya estrellita espera a que llegue la chispa. Su resultado ya está
  // en results (para el resto de la pantalla), pero la mini constelación no lo muestra todavía
  const [landing, setLanding] = useState<number | null>(null);
  const [xp, setXp] = useState(0);
  // El XP del encabezado del juego: suma recién cuando la chispa llega a su estrellita, y cuenta hacia arriba
  const [headerXp, setHeaderXp] = useState(0);
  const shownXp = useAnimatedNumber(headerXp);
  const [roundStartXp, setRoundStartXp] = useState(0);
  const [starXp, setStarXp] = useState<number | null>(null);
  const [response, setResponse] = useState<AnswerResponse | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const index = round[step]!;
  const question = questions[index];
  if (!question) return null;

  async function check() {
    if (!response || checking) return;
    setChecking(true);
    setError(null);
    try {
      const answer = await api<AnswerResult>(
        `/questions/${question!.id}/answer`,
        {
          method: "POST",
          body: JSON.stringify({ response, attempt: question!.attempt }),
        },
      );
      // flushSync aplica estos cambios ya, así la pantalla muestra el veredicto antes de animar
      flushSync(() => {
        setResult(answer);
        setResults((previous) => {
          const next = [...previous];
          next[index] = answer.correct ? "ok" : "bad";
          return next;
        });
        setLanding(index);
        setXp((previous) => previous + answer.xpGained);
        if (answer.starCompleted) setStarXp(answer.starXp);
      });
      if (answer.xpGained > 0) addXp(answer.xpGained);
      noteActivity(); // si era lo primero del día, la racha cambió
      animateVerdict(answer.correct, index, answer.xpGained);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No pudimos comprobar tu respuesta. Probá de nuevo.",
      );
    } finally {
      setChecking(false);
    }
  }

  // Si acertó: estallido en la respuesta y una chispa que viaja hasta su estrellita, que se enciende al llegar.
  // Si no: la estrellita se pone naranja un momento después
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
    setResult(null);
    setLanding(null);
    if (step + 1 >= round.length) {
      setFinished(true);
      return;
    }
    setStep(step + 1);
  }

  // Otra vuelta, solo con las que no acertó. Pide la estrella de nuevo para que se mezclen distinto
  async function retry() {
    const failed = round.filter((i) => results[i] !== "ok");
    try {
      setPlay(await api<StarPlay>(`/stars/${star.id}`));
    } catch {
      // Si falla, se reintenta con la mezcla de antes: el intento que se manda sigue siendo el que se mostró
    }
    // Las acertadas quedan encendidas; las que se vuelven a jugar, vacías
    const kept: StepResult[] = [];
    results.forEach((r, i) => {
      if (r === "ok") kept[i] = r;
    });
    setResults(kept);
    setRound(failed);
    setStep(0);
    setIsRetry(true);
    setRoundStartXp(xp);
    setFinished(false);
  }

  if (finished) {
    if (starXp !== null) {
      return (
        <StarLit star={star} nextStar={nextStar} courseKey={course.key} answersXp={xp - starXp} starXp={starXp} />
      );
    }
    if (star.completed) {
      return (
        <StarReplay star={star} nextStar={nextStar} courseKey={course.key} results={results} onRetry={retry} />
      );
    }
    return (
      <StarUnfinished
        mode="end"
        star={star}
        questions={questions}
        results={results}
        xp={xp - roundStartXp}
        courseKey={course.key}
        onRetry={retry}
      />
    );
  }

  // Antes de jugar una estrella que dejó a medias, le mostramos lo que ya tiene
  if (intro) {
    return (
      <StarUnfinished
        mode="resume"
        star={star}
        questions={questions}
        results={results}
        xp={0}
        courseKey={course.key}
        onRetry={() => setIntro(false)}
      />
    );
  }

  let progress;
  if (isRetry) progress = `reintento ${step + 1} de ${round.length}`;
  else if (start.resume) progress = `te faltan ${round.length - step}`;
  else progress = `pregunta ${step + 1} de ${round.length}`;

  return (
    <div className={styles.page}>
      <header className={styles.wrap}>
        <div className={styles.top}>
          <Link
            to={`/constellations/${course.key}`}
            className={styles.close}
            aria-label="Salir de la estrella"
          >
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
          <b>{star.letter}</b>
          {star.title}, {progress}
        </p>
      </header>

      <main className={styles.wrap}>
        <div className={styles.stage} key={question.id}>
          <p className={styles.kind}>{KIND[question.type]}</p>
          <h1 className={styles.prompt}>{question.prompt}</h1>
          {(question.type === "output" ||
            question.type === "multiple_choice") && (
            <ChoiceGame
              question={question}
              response={response as { choice: number } | null}
              onChange={setResponse}
              result={result}
            />
          )}
          {question.type === "fill_blank" && (
            <FillBlankGame
              question={question}
              onChange={setResponse}
              result={result}
            />
          )}
          {question.type === "order_lines" && (
            <OrderLinesGame
              question={question}
              onChange={setResponse}
              result={result}
            />
          )}
        </div>
      </main>

      {result ? (
        <Verdict result={result} onNext={next} />
      ) : (
        <div className={styles.dock}>
          <div className={styles.wrap}>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className={styles.go}
              disabled={response === null || checking}
              onClick={check}
            >
              {checking ? "Comprobando..." : "Comprobar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
