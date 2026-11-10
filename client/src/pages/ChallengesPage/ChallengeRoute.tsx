import type { ChallengePart } from "../../types";
import styles from "./ChallengeRoute.module.css";

type Props = {
  questions: { part: ChallengePart; correct: boolean | null }[];
  explore: string | null; // el nombre del curso de Explorá
  discover?: string | null; // el de Descubrí (puede ser el mismo)
  current?: number; // la posición (desde 0) que se está jugando, si hay una
};

const LABEL: Record<ChallengePart, string> = { own: "Tus cursos", explore: "Explorá", discover: "Descubrí" };

// Las preguntas del desafío como una constelación corta, en grupos: tus cursos, Explorá y Descubrí.
// Las acertadas se encienden y las falladas quedan en coral, como en el repaso
export function ChallengeRoute({ questions, explore, discover = null, current }: Props) {
  const parts = (["own", "explore", "discover"] as ChallengePart[])
    .map((part) => ({ part, items: questions.map((q, i) => ({ ...q, i })).filter((q) => q.part === part) }))
    .filter((g) => g.items.length > 0);
  const answered = questions.filter((q) => q.correct !== null).length;

  const detail = (part: ChallengePart, count: number) => {
    if (part === "explore") return explore ?? "Otro curso";
    if (part === "discover") return discover ?? "Otro curso";
    return `${count} ${count === 1 ? "pregunta" : "preguntas"}`;
  };

  return (
    <div className={styles.route} role="img" aria-label={`${answered} de ${questions.length} preguntas respondidas`}>
      {parts.map(({ part, items }) => (
        <div key={part} className={`${styles.group} ${part === "own" ? "" : styles.other}`}>
          <div className={styles.stars}>
            {items.map((q, k) => {
              const state = q.correct === true ? styles.right : q.correct === false ? styles.wrong : q.i === current ? styles.now : "";
              const linked = k > 0 && items[k - 1]!.correct !== null && q.correct !== null;
              return (
                <span key={q.i} className={styles.cell}>
                  {k > 0 && <span className={`${styles.link} ${linked ? styles.on : ""}`} />}
                  <span className={`${styles.q} ${state}`}>
                    <svg viewBox="-13 -13 26 26" aria-hidden="true">
                      <path className={styles.flare} d="M0 -12 L1.4 -1.4 L12 0 L1.4 1.4 L0 12 L-1.4 1.4 L-12 0 L-1.4 -1.4 Z" />
                      <circle className={styles.core} r="5" />
                    </svg>
                  </span>
                </span>
              );
            })}
          </div>
          <p className={styles.label}>
            <b>{LABEL[part]}</b>
            {detail(part, items.length)}
          </p>
        </div>
      ))}
    </div>
  );
}
