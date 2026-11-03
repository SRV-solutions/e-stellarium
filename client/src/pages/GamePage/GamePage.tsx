import { useState } from "react";
import { Link, useParams } from "react-router";
import { useStar } from "../../hooks/useStar";
import { greekLetter } from "../../lib/sky";
import { MiniConstellation, type StepResult } from "../../components/MiniConstellation/MiniConstellation";
import styles from "./GamePage.module.css";
import { ChoiceGame } from "./games/ChoiceGame";
import { FillBlankGame } from "./games/FillBlankGame";
import { OrderLinesGame } from "./games/OrderLinesGame";
import type { AnswerResponse, AnswerResult, StarPlay, StudentQuestion } from "../../types";

const KIND: Record<StudentQuestion["type"], string> = {
  output: "¿Qué imprime?",
  fill_blank: "Completá el hueco",
  order_lines: "Ordená las líneas",
  multiple_choice: "Opción múltiple",
};

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
        {state.message} <Link to="/constellations">Volver a tus constelaciones</Link>
      </p>
    );
  }

  return <Game key={state.play.star.id} play={state.play} />;
}

function Game({ play }: { play: StarPlay }) {
  const { star, questions } = play;
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<StepResult[]>([]);
  const [xp, setXp] = useState(0);
  const [response, setResponse] = useState<AnswerResponse | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);

  const question = questions[index];
  if (!question) return null;

  return (
    <div className={styles.page}>
      <header className={styles.wrap}>
        <div className={styles.top}>
          <Link to="/constellations" className={styles.close} aria-label="Salir de la estrella">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
          <MiniConstellation total={questions.length} current={index} results={results} />
          <span className={styles.xp}>+{xp} XP</span>
        </div>
        <p className={styles.where}>
          <b>{greekLetter(star.position - 1)}</b>
          {star.title}, pregunta {index + 1} de {questions.length}
        </p>
      </header>

      <main className={styles.wrap}>
        <div className={styles.stage} key={question.id}>
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
          {question.type === "fill_blank" && (
            <FillBlankGame question={question} onChange={setResponse} result={result} />
          )}
          {question.type === "order_lines" && (
            <OrderLinesGame question={question} onChange={setResponse} result={result} />
          )}
        </div>
      </main>

      <div className={styles.dock}>
        <div className={styles.wrap}>
          <button type="button" className={styles.go} disabled={response === null}>
            Comprobar
          </button>
        </div>
      </div>
    </div>
  );
}