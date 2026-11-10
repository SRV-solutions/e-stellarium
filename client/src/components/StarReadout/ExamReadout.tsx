import { Link, useNavigate } from "react-router";
import { useCountdown } from "../../hooks/useCountdown";
import { ordinal } from "../../lib/sky";
import { formatCountdown, formatMoment } from "../../lib/time";
import type { ExamSummary, StarSummary } from "../../types";
import styles from "./StarReadout.module.css";

const DEFAULT_DESCRIPTION =
  "Diez preguntas nuevas de toda la constelación, con tiempo. Aprobalo y ganás un descuento para tu próximo curso.";

const STATUS_TEXT: Record<ExamSummary["status"], string> = {
  locked: "el examen, todavía cerrado",
  waiting: "el examen, la cúpula se abre pronto",
  open: "el examen, listo para rendir",
  in_progress: "el examen, en curso",
  retry_wait: "el examen, esperando otro intento",
  passed: "aprobado",
};

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
  onOpen?: () => void; // cuando termina la espera, para volver a pedir el estado a la API
};

export function ExamReadout({ star, index, previous, onOpen }: Props) {
  const navigate = useNavigate();
  const exam = star.exam!;
  const opensAt = exam.status === "waiting" || exam.status === "retry_wait" ? exam.opensAt : null;
  const left = useCountdown(opensAt, onOpen);
  const go = () => navigate(`/exams/${star.id}`);

  let action;
  if (exam.status === "locked") {
    const missing = previous && !previous.completed;
    action = (
      <p className={styles.lock}>
        {missing ? (
          <>
            Encendé{" "}
            <b>
              {previous.letter} {previous.title}
            </b>
            .
          </>
        ) : (
          "Encendé todas las lecciones."
        )}{" "}
        Tres días después se abre el examen.
      </p>
    );
  } else if (opensAt) {
    const retry = exam.status === "retry_wait";
    action = (
      <>
        <div className={styles.clock} role="timer">
          <small>{retry ? "Nuevo intento en" : "Se abre en"}</small>
          {formatCountdown(left)}
        </div>
        <p className={styles.lock}>
          {retry && (
            <>
              Tu último intento: <b>{exam.lastCorrect} de 10</b>.{" "}
            </>
          )}
          Disponible {formatMoment(new Date(opensAt))}.
        </p>
      </>
    );
  } else if (exam.status === "open" || exam.status === "in_progress") {
    action = (
      <button type="button" className={`${styles.cta} ${styles.examCta}`} onClick={go}>
        <StarIcon />
        {exam.status === "in_progress" ? "Seguir el examen" : "Rendir el examen"}
      </button>
    );
  } else {
    action = (
      <>
        <button type="button" className={`${styles.cta} ${styles.ghost}`} onClick={go}>
          Ver el resultado
        </button>
        <p className={styles.toHome}>
          Tu cupón está en <Link to="/">el inicio</Link>.
        </p>
      </>
    );
  }

  return (
    <section className={styles.readout} aria-live="polite">
      <div className={`${styles.inner} ${styles.examInner}`}>
        <div className={styles.letter} aria-hidden="true">
          {star.letter}
        </div>

        <div>
          <p className={styles.ordinal}>
            {ordinal(index)},{" "}
            <span className={exam.status === "passed" ? styles.examPassed : styles.exam}>
              {STATUS_TEXT[exam.status]}
            </span>
          </p>
          <h2 className={styles.name}>{star.title}</h2>
          <p className={styles.description}>{star.description ?? DEFAULT_DESCRIPTION}</p>
        </div>

        <div className={styles.figures}>
          <div>
            <b>10</b>
            preguntas
          </div>
          <div>
            <b>7</b>
            para aprobar
          </div>
          <div className={styles.gain}>
            <b>{exam.couponPercent} %</b>
            de descuento
          </div>
        </div>

        <div className={styles.action}>{action}</div>
      </div>
    </section>
  );
}
