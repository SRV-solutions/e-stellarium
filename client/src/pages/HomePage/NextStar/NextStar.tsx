import { Link } from "react-router";
import { ordinal } from "../../../lib/sky";
import { xpToGain } from "../../../lib/xp";
import type { StarSummary } from "../../../types";
import styles from "./NextStar.module.css";

// Lo que se lee al lado del ocular: la próxima estrella, o que ya no quedan, o que todavía no hay
export type Sighting =
  | { kind: "next"; star: StarSummary; index: number; courseName: string }
  | { kind: "done"; courseKey: string }
  | { kind: "empty" };

type Props = {
  sighting: Sighting;
  show: boolean; // aparece recién cuando el ocular termina de moverse
};

export function NextStar({ sighting, show }: Props) {
  let content;
  if (sighting.kind === "next") {
    const { star, index, courseName } = sighting;
    content = (
      <>
        <p className={styles.state}>{ordinal(index)}, lista para encender</p>
        <h2 className={styles.name}>
          <i>{star.letter}</i>
          {star.title}
        </h2>
        <p className={styles.course}>
          <b>{courseName}</b>. {star.questionCount} juegos y hasta <b>+{xpToGain(star.questionCount)} XP</b>.
        </p>
        <Link to={`/stars/${star.id}`} className={styles.go}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />
          </svg>
          Encender estrella
        </Link>
      </>
    );
  } else if (sighting.kind === "done") {
    content = (
      <>
        <p className={styles.state}>Tu cielo está completo</p>
        <h2 className={styles.name}>Encendiste todas tus estrellas</h2>
        <p className={styles.note}>Cuando sumemos nuevas, aparecen acá. Mientras tanto, podés repasar las que ya encendiste.</p>
        <Link to={`/constellations/${sighting.courseKey}`} className={styles.ghost}>
          Ir a mis constelaciones
        </Link>
      </>
    );
  } else {
    content = (
      <>
        <p className={styles.state}>Todavía no hay estrellas en tu cielo</p>
        <h2 className={styles.name}>Tu constelación se está armando</h2>
        <p className={styles.note}>Cuando tu curso tenga sus primeras estrellas, aparecen acá. El material ya está en Drive.</p>
      </>
    );
  }

  return (
    <div className={`${styles.readout} ${show ? styles.show : ""}`} aria-live="polite">
      {content}
    </div>
  );
}
