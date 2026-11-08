import type { AnswerResult, StudentQuestion } from "../../../types";
import { CodeText, Terminal } from "../Terminal/Terminal";
import styles from "./games.module.css";

type ChoiceQuestion = Extract<StudentQuestion, { type: "output" | "multiple_choice" }>;

type Props = {
  question: ChoiceQuestion;
  response: { choice: number } | null;
  onChange: (response: { choice: number }) => void;
  result: AnswerResult | null;
};

// "¿Qué imprime?" y "Opción múltiple": elegir una opción
export function ChoiceGame({ question, response, onChange, result }: Props) {
  const isOutput = question.type === "output";
  const picked = response?.choice ?? null;
  const solution = result && "choice" in result.solution ? result.solution.choice : null;

  return (
    <>
      {question.type === "output" && (
        <Terminal
          lines={question.content.code.split("\n").map((line, i) => <CodeText key={i} text={line} />)}
          output={result ? result.output : undefined}
        />
      )}

      <div className={styles.options}>
        {question.content.options.map((option, i) => {
          let state = "";
          let mark = "";
          if (result) {
            if (i === solution) {
              state = styles.right!;
              mark = i === picked ? "Tu respuesta" : "La correcta";
            } else if (i === picked) {
              state = styles.wrong!;
              mark = "Tu respuesta";
            } else {
              state = styles.faded!;
            }
          }

          return (
            <button
              key={i}
              type="button"
              className={`${styles.option} ${isOutput ? styles.mono : ""} ${state}`}
              aria-pressed={picked === i}
              disabled={result !== null}
              // Desde la respuesta elegida sale la chispa (o el estallido) del veredicto
              data-answer={result && i === picked ? true : undefined}
              onClick={() => onChange({ choice: i })}
            >
              <span className={styles.optionText}>{option}</span>
              {mark && <span className={styles.mark}>{mark}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}