import { useState, type ReactNode } from "react";
import type { AnswerResult, StudentQuestion } from "../../../types";
import { CodeText, Terminal } from "../Terminal/Terminal";
import styles from "./games.module.css";

type FillQuestion = Extract<StudentQuestion, { type: "fill_blank" }>;

type Props = {
  question: FillQuestion;
  onChange: (response: { choices: number[] } | null) => void;
  result: AnswerResult | null;
};

export function FillBlankGame({ question, onChange, result }: Props) {
  const { code, blanks } = question.content;
  const [picked, setPicked] = useState<(number | null)[]>(() => blanks.map(() => null));
  const solution = result && "choices" in result.solution ? result.solution.choices : null;
  const active = result ? -1 : picked.findIndex((p) => p === null);

  function update(next: (number | null)[]) {
    setPicked(next);
    // A la página solo le llega la respuesta cuando están todos los huecos
    const complete = next.every((p) => p !== null);
    onChange(complete ? { choices: next as number[] } : null);
  }

  function choose(option: number) {
    const next = [...picked];
    next[active] = option;
    update(next);
  }

  function clear(blank: number) {
    if (result) return;
    const next = [...picked];
    next[blank] = null;
    update(next);
  }

  function slot(blank: number) {
    const value = picked[blank] ?? null;
    let cls = styles.slot;
    if (value !== null) cls += ` ${styles.filled}`;
    if (blank === active) cls += ` ${styles.active}`;
    if (solution) cls += ` ${value === solution[blank] ? styles.slotRight : styles.slotWrong}`;

    return (
      <button key={`slot-${blank}`} type="button" className={cls} onClick={() => clear(blank)} aria-label={`Hueco ${blank + 1}`}>
        {value === null ? "\u00a0" : blanks[blank]![value]}
      </button>
    );
  }

  // Arma las líneas del código, con los huecos en su lugar
  const lines: ReactNode[][] = [[]];
  const parts = code.split("___");
  parts.forEach((part, i) => {
    part.split("\n").forEach((piece, j) => {
      if (j > 0) lines.push([]);
      if (piece) lines.at(-1)!.push(<CodeText key={`text-${i}-${j}`} text={piece} />);
    });
    if (i < parts.length - 1) lines.at(-1)!.push(slot(i));
  });

  return (
    <>
      <Terminal lines={lines.map((nodes, i) => <span key={i}>{nodes}</span>)} output={result ? result.output : undefined} />

      {active >= 0 && (
        <>
          <p className={styles.hint}>Elegí qué va en el hueco {active + 1}</p>
          <div className={styles.chips}>
            {blanks[active]!.map((option, i) => (
              <button key={i} type="button" className={styles.chip} onClick={() => choose(i)}>
                {option}
              </button>
            ))}
          </div>
        </>
      )}

      {active === -1 && !result && <p className={styles.hint}>Listo. Tocá un hueco si lo querés cambiar.</p>}
    </>
  );
}