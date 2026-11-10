import { useEffect, useRef } from "react";
import type { AnswerResult } from "../../../types";
import styles from "./Verdict.module.css";

type Props = {
  result: AnswerResult;
  onNext: () => void;
  missTitle?: string; // el título si no acertó
};

export function Verdict({ result, onNext, missTitle = "Casi. Esta va a tu repaso" }: Props) {
  const button = useRef<HTMLButtonElement>(null);

  // Al aparecer, el foco va a "Continuar": con Enter se sigue, sin buscar el botón
  useEffect(() => {
    button.current?.focus();
  }, []);

  let title;
  if (!result.correct) title = missTitle;
  else if (result.xpGained > 0) title = `¡Correcto! +${result.xpGained} XP`;
  else title = "¡Correcto!";

  return (
    <section className={`${styles.sheet} ${result.correct ? styles.right : styles.wrong}`} aria-live="polite">
      <div className={styles.inner}>
        <div className={styles.badge} aria-hidden="true">
          {result.correct ? (
            <svg viewBox="0 0 24 24">
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2" />
            </svg>
          )}
        </div>
        <div className={styles.text}>
          <strong>{title}</strong>
          <p>{result.explanation}</p>
        </div>
        <button ref={button} type="button" className={styles.next} onClick={onNext}>
          Continuar
        </button>
      </div>
    </section>
  );
}