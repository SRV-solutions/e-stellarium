import { useNavigate } from "react-router";
import { greekLetter, ordinal } from "../../lib/sky";
import { xpToGain } from "../../lib/xp";
import type { StarSummary } from "../../types";
import { ExamReadout } from "./ExamReadout";
import styles from "./StarReadout.module.css";

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />
    </svg>
  );
}

type Props = {
  star: StarSummary;
  index: number;
  previous?: StarSummary;
  onExamOpens?: () => void;
};

export function StarReadout({ star, index, previous, onExamOpens }: Props) {
  if (star.exam) return <ExamReadout star={star} index={index} previous={previous} onOpen={onExamOpens} />;
  return <LessonReadout star={star} index={index} previous={previous} />;
}

function LessonReadout({ star, index, previous }: Props) {
  const navigate = useNavigate();
  const exam = star.kind === "exam";
  const play = () => navigate(`/stars/${star.id}`);

  let status;
  let action;
  if (star.completed) {
    status = <span className={styles.done}>encendida</span>;
    action = (
      <button type="button" className={`${styles.cta} ${styles.ghost}`} onClick={play}>
        Repasar
      </button>
    );
  } else if (star.unlocked) {
    status = <span className={styles.current}>lista para encender</span>;
    action = (
      <button type="button" className={styles.cta} onClick={play}>
        <StarIcon />
        Encender estrella
      </button>
    );
  } else if (exam) {
    status = <span className={styles.exam}>el examen final</span>;
    action = <p className={styles.lock}>Se abre cuando enciendas todas las demás estrellas.</p>;
  } else {
    status = <span className={styles.locked}>bloqueada</span>;
    action = (
      <p className={styles.lock}>
        Encendé{" "}
        <b>
          {greekLetter(index - 1)} {previous?.title}
        </b>{" "}
        para abrir esta estrella.
      </p>
    );
  }

  return (
    <section className={styles.readout} aria-live="polite">
      <div className={styles.inner}>
        <div className={styles.letter} aria-hidden="true">
          {greekLetter(index)}
        </div>

        <div>
          <p className={styles.ordinal}>
            {ordinal(index)}, {status}
          </p>
          <h2 className={styles.name}>{star.title}</h2>
          {star.description && <p className={styles.description}>{star.description}</p>}
        </div>

        {!exam && (
          <div className={styles.figures}>
            <div>
              <b>{star.questionCount}</b>
              juegos
            </div>
            <div className={styles.gain}>
              <b>+{xpToGain(star.questionCount)}</b>
              XP para ganar
            </div>
          </div>
        )}

        <div className={styles.action}>{action}</div>
      </div>
    </section>
  );
}