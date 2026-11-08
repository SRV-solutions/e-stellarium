import { useState } from "react";
import type { AnswerResult, StudentQuestion } from "../../../types";
import { CodeText, Terminal } from "../Terminal/Terminal";
import styles from "./games.module.css";

type OrderQuestion = Extract<StudentQuestion, { type: "order_lines" }>;

type Props = {
  question: OrderQuestion;
  onChange: (response: { order: number[] } | null) => void;
  result: AnswerResult | null;
};

export function OrderLinesGame({ question, onChange, result }: Props) {
  const { lines } = question.content;
  // Las posiciones de las líneas, en el orden en que el alumno las fue poniendo
  const [order, setOrder] = useState<number[]>([]);
  const solution = result && "order" in result.solution ? result.solution.order : null;

  function update(next: number[]) {
    setOrder(next);
    onChange(next.length === lines.length ? { order: next } : null);
  }

  return (
    <>
      <p className={styles.areaTitle}>Tu programa</p>
      {/* Desde el programa armado sale la chispa (o el estallido) del veredicto */}
      <div className={styles.program} data-answer={result ? true : undefined}>
        {order.length === 0 && <p className={styles.empty}>Tocá las líneas en el orden en que se ejecutan.</p>}
        {order.map((lineIndex, position) => {
          // Se compara el texto, como en la API: dos líneas iguales son intercambiables
          const isRight = solution && lines[lineIndex] === lines[solution[position]!];
          const state = solution ? (isRight ? styles.lineRight : styles.lineWrong) : "";
          return (
            <button
              key={lineIndex}
              type="button"
              className={`${styles.line} ${styles.placed} ${state}`}
              style={{ animationDelay: solution ? `${position * 120}ms` : undefined }}
              disabled={result !== null}
              onClick={() => update(order.filter((_, p) => p !== position))}
            >
              <span className={styles.lineNumber}>{position + 1}</span>
              <span>
                <CodeText text={lines[lineIndex]!} />
              </span>
            </button>
          );
        })}
      </div>

      {result ? (
        <Terminal lines={[]} output={result.output} />
      ) : (
        <>
          <p className={styles.areaTitle}>Líneas</p>
          <div className={styles.bank}>
            {lines.map((text, i) => {
              const used = order.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  className={`${styles.line} ${used ? styles.used : ""}`}
                  disabled={used}
                  onClick={() => update([...order, i])}
                >
                  <span>
                    <CodeText text={text} />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}