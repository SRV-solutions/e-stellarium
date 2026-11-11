import { useEffect, useRef } from "react";
import { Link } from "react-router";
import styles from "./PracticePage.module.css";

type Props = {
  correctCount: number;
  total: number;
  constellation: string; // a dónde vuelve
  onAgain: () => void; // arma otra práctica
};

// El final de la práctica: cuántas acertó, y otra vez o volver
export function PracticeDone({ correctCount, total, constellation, onAgain }: Props) {
  const again = useRef<HTMLButtonElement>(null);

  // El foco va a "Practicar otra vez": con Enter se sigue
  useEffect(() => {
    again.current?.focus();
  }, []);

  return (
    <main className={styles.done}>
      <div className={styles.inner}>
        <div className={styles.omega} aria-hidden="true">
          Ω
        </div>
        <p className={styles.doneKicker}>Práctica del examen</p>
        <h1 className={styles.title}>Práctica hecha</h1>
        <p className={styles.score}>
          Acertaste <b>{correctCount}</b> de {total}.
        </p>
        <p className={styles.hint}>Cada práctica sortea otras 10 preguntas del curso, de las lecciones y de los desafíos.</p>
        <div className={styles.buttons}>
          <button ref={again} type="button" className={styles.go} onClick={onAgain}>
            Practicar otra vez
          </button>
          <Link to={constellation} className={styles.ghost}>
            Volver a la constelación
          </Link>
        </div>
      </div>
    </main>
  );
}
