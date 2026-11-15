import { useMemo, useState } from "react";
import { ChoiceGame } from "../GamePage/games/ChoiceGame";
import { FillBlankGame } from "../GamePage/games/FillBlankGame";
import { OrderLinesGame } from "../GamePage/games/OrderLinesGame";
import type { AnswerResponse, AnswerResult } from "../../types";
import { gradePreview, mixFor, studentQuestion, TYPE_INFO, type Draft } from "./content";
import styles from "./StudentPreview.module.css";

type Props = {
  draft: Draft;
  where: { letter: string; name: string };
};

// La pregunta tal como la va a ver el alumno, con los mismos juegos de las estrellas. Se puede jugar:
// la mezcla y la corrección se hacen acá (es el staff, que ya sabe la respuesta)
export function StudentPreview({ draft, where }: Props) {
  // Cada cambio en lo que escribe vuelve a empezar la partida
  const signature = JSON.stringify(draft);
  const [round, setRound] = useState(0);
  const [played, setPlayed] = useState<{ signature: string; round: number; response: AnswerResponse | null; result: AnswerResult | null }>({
    signature,
    round,
    response: null,
    result: null,
  });
  const fresh = played.signature === signature && played.round === round;
  const response = fresh ? played.response : null;
  const result = fresh ? played.result : null;

  // La mezcla cambia solo si cambia la forma de las listas, o con "Mezclar otra vez"
  const shape = JSON.stringify([draft.type, draft.options.length, draft.blanks.map((b) => b.length), draft.lines.split("\n").length]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mix = useMemo(() => mixFor(draft), [shape, round]);
  const question = studentQuestion(draft, mix);

  function respond(next: AnswerResponse | null) {
    setPlayed({ signature, round, response: next, result: null });
  }

  function check() {
    if (!response) return;
    setPlayed({ signature, round, response, result: gradePreview(draft, mix, response) });
  }

  function again() {
    setRound((r) => r + 1);
  }

  const key = `${signature}:${round}`;
  return (
    <div className={styles.preview}>
      <div className={styles.cap}>
        <span>Así la ve el alumno</span>
        <button type="button" className={styles.ghost} onClick={again}>
          Mezclar otra vez
        </button>
      </div>
      <div className={styles.screen}>
        <p className={styles.where}>
          <b>{where.letter}</b>
          {where.name}
        </p>
        <p className={styles.kind}>{TYPE_INFO[draft.type].name}</p>
        <h2 className={styles.prompt}>{draft.prompt.trim() || <span className={styles.empty}>Lo que se le pregunta</span>}</h2>

        {question && (
          <div className={styles.game} key={key}>
            {(question.type === "output" || question.type === "multiple_choice") && (
              <ChoiceGame
                question={question}
                response={response as { choice: number } | null}
                onChange={respond}
                result={result}
              />
            )}
            {question.type === "fill_blank" && <FillBlankGame question={question} onChange={respond} result={result} />}
            {question.type === "order_lines" && <OrderLinesGame question={question} onChange={respond} result={result} />}
          </div>
        )}

        {result ? (
          <div className={`${styles.verdict} ${result.correct ? styles.ok : styles.bad}`} aria-live="polite">
            <b>{result.correct ? "¡Correcto!" : "No era esa"}</b>
            <p>{draft.explanation.trim() || "Acá aparece la explicación."}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.button} onClick={again}>
                Probar de nuevo
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.actions}>
            <button type="button" className={`${styles.button} ${styles.primary}`} disabled={!response} onClick={check}>
              Comprobar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
